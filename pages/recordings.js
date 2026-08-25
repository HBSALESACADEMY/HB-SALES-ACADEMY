import { useEffect, useState } from "react";
import Layout from "../components/Layout";
import Icon from "../components/Icon";
import Avatar from "../components/Avatar";
import AudioPlayer from "../components/AudioPlayer";
import AIBadge from "../components/AIBadge";
import { supabase } from "../lib/supabaseClient";
import { apiPost, apiGet } from "../lib/apiClient";
import { validateRecordingUpload } from "../lib/uploadValidation";
import { verstaendlicherSpeicherFehler } from "../lib/speicherFehler";
import { meldeStoerung } from "../lib/fehlerMelden";
import { openProfile } from "../lib/profileModalBus";
import { ABSTAND } from "../lib/autoRefresh";
import { loescheGeprueft, aendereGeprueft } from "../lib/loeschen";

const STATUS_LABELS = { pending: "Wird ausgewertet...", evaluated: "Ausgewertet", failed: "Auswertung fehlgeschlagen" };

export default function Recordings() {
  const [loading, setLoading] = useState(true);
  const [selfId, setSelfId] = useState(null);
  const [recordings, setRecordings] = useState([]);
  const [profileMap, setProfileMap] = useState({});
  const [label, setLabel] = useState("");
  const [visibility, setVisibility] = useState("private");
  const [outcome, setOutcome] = useState(null);
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [playingId, setPlayingId] = useState(null);
  const [playingUrl, setPlayingUrl] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [outcomeFilter, setOutcomeFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [myLeads, setMyLeads] = useState([]);
  const [leadId, setLeadId] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editLabel, setEditLabel] = useState("");
  const [editLeadId, setEditLeadId] = useState("");
  const [editVisibility, setEditVisibility] = useState("private");
  const [editOutcome, setEditOutcome] = useState(null);
  const [savingEdit, setSavingEdit] = useState(false);

  async function load(silent) {
    if (!silent) setLoading(true);
    setError("");
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    setSelfId(session.user.id);

    // RLS regelt die Sichtbarkeit bereits vollständig (eigene + organisationsweit
    // freigegebene + Plattform-Admin sieht alles) — kein manueller Filter nötig.
    const [{ data, error: err }, { data: leadRows }] = await Promise.all([
      // Obergrenze, damit die Liste nicht unbegrenzt mit der Zeit mitwächst.
      supabase.from("call_recordings").select("*").order("created_at", { ascending: false }).limit(300),
      supabase.from("leads").select("id, name, company").eq("created_by", session.user.id).order("created_at", { ascending: false }),
    ]);
    if (err) setError(err.message);
    setRecordings(data || []);
    setMyLeads(leadRows || []);

    const otherIds = [...new Set((data || []).filter((r) => r.created_by !== session.user.id).map((r) => r.created_by))];
    if (otherIds.length) {
      const { data: profiles } = await supabase.from("profiles").select("id, full_name, avatar_url").in("id", otherIds);
      const map = {};
      (profiles || []).forEach((p) => { map[p.id] = p; });
      setProfileMap(map);
    }
    if (!silent) setLoading(false);
  }

  useEffect(() => {
    load();
    // Läuft im Hintergrund "silent" (ohne den globalen Ladezustand zu setzen) —
    // sonst würde der volle Seiten-Unmount alle 20s ein gerade abspielendes
    // <audio>-Element zerstören und die Wiedergabe abrupt abbrechen.
    // Nur abfragen, wenn der Tab sichtbar ist; beim Zurückwechseln sofort.
    // Abstand: keine Echtzeit, ändert sich selten.
    const interval = setInterval(() => { if (!document.hidden) (() => load(true))(); }, ABSTAND.GELEGENTLICH);
    const beiSichtbar = () => { if (!document.hidden) (() => load(true))(); };
    document.addEventListener("visibilitychange", beiSichtbar);
    return () => { clearInterval(interval); document.removeEventListener("visibilitychange", beiSichtbar); };
  }, []);

  async function upload() {
    if (!file) return;
    if (!outcome) { setError("Bitte wähle, ob der Anruf positiv oder negativ verlaufen ist."); return; }
    const validationError = validateRecordingUpload(file);
    if (validationError) { setError(validationError); return; }
    setUploading(true);
    setError("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      // Nur die Dateiendung übernehmen, nicht den vollen Dateinamen — Supabase
      // Storage lehnt Pfade mit bestimmten Sonderzeichen (z.B. €) mit "Invalid
      // key" ab. Der Original-Dateiname bleibt separat in file_name erhalten.
      const ext = (file.name.split(".").pop() || "mp3").toLowerCase();
      const path = `${session.user.id}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("call-recordings").upload(path, file);
      if (upErr) throw upErr;

      const { data: row, error: insErr } = await supabase.from("call_recordings").insert({
        created_by: session.user.id,
        label: label.trim() || null,
        recording_path: path,
        file_name: file.name,
        visibility,
        outcome,
        lead_id: leadId || null,
      }).select().single();
      if (insErr) throw insErr;

      setLabel("");
      setFile(null);
      setOutcome(null);
      setLeadId("");
      await load();

      // Auswertung im Hintergrund anstoßen — Liste zeigt "Wird ausgewertet..."
      // und aktualisiert sich per Polling automatisch, sobald fertig.
      apiPost("/api/call-recording-evaluate", { recordingId: row.id })
        .then(() => load())
        .catch((e) => console.error("call-recording-evaluate failed:", e.message));
    } catch (e) {
      setError(verstaendlicherSpeicherFehler(e));
      // Der Betreiber soll davon erfahren — sonst bleibt es beim "geht nicht".
      meldeStoerung("Aufnahme hochladen", e?.message || String(e));
    } finally {
      setUploading(false);
    }
  }

  async function deleteRecording(id) {
    if (!confirm("Aufnahme wirklich löschen?")) return;
    const rec = recordings.find((r) => r.id === id);
    const loeschFehler = await loescheGeprueft(supabase.from("call_recordings").delete().eq("id", id),
      "Diese Aufnahme darf nur löschen, wer sie hochgeladen hat.");
    if (loeschFehler) { setError(loeschFehler); return; }
    // Ohne das hier würde die eigentliche Audiodatei im Speicher liegen
    // bleiben — nur der Datenbank-Eintrag verschwindet sonst (DSGVO: Löschung
    // muss auch die Datei selbst treffen, nicht nur die Metadaten).
    if (rec?.recording_path) {
      await supabase.storage.from("call-recordings").remove([rec.recording_path]);
    }
    await load();
  }

  function startEdit(r) {
    setEditingId(r.id);
    setEditLabel(r.label || "");
    setEditLeadId(r.lead_id || "");
    setEditVisibility(r.visibility);
    setEditOutcome(r.outcome || null);
  }

  async function saveEdit(id) {
    setSavingEdit(true);
    setError("");
    const err = await aendereGeprueft(supabase.from("call_recordings").update({
      label: editLabel.trim() || null,
      lead_id: editLeadId || null,
      visibility: editVisibility,
      outcome: editOutcome,
    }).eq("id", id), "Diese Aufnahme darf nur bearbeiten, wer sie hochgeladen hat.");
    if (err) { setError(err); setSavingEdit(false); return; }
    setEditingId(null);
    setSavingEdit(false);
    await load(true);
  }

  async function togglePlay(recording) {
    if (playingId === recording.id) { setPlayingId(null); setPlayingUrl(null); return; }
    try {
      const { url } = await apiGet(`/api/call-recording-url?recordingId=${recording.id}`);
      setPlayingId(recording.id);
      setPlayingUrl(url);
    } catch (e) {
      setError(e.message);
    }
  }

  if (loading) return <Layout><p className="text-textMuted text-sm">Lädt...</p></Layout>;

  const leadMap = {};
  myLeads.forEach((l) => { leadMap[l.id] = l; });

  const q = searchQuery.trim().toLowerCase();
  const filteredRecordings = recordings.filter((r) => {
    if (outcomeFilter !== "all" && r.outcome !== outcomeFilter) return false;
    if (!q) return true;
    const owner = profileMap[r.created_by];
    const assignedLead = r.lead_id ? leadMap[r.lead_id] : null;
    const haystack = [
      r.label, r.file_name, r.evaluation_summary,
      assignedLead?.name, assignedLead?.company,
      owner?.full_name,
    ].filter(Boolean).join(" ").toLowerCase();
    return haystack.includes(q);
  });

  return (
    <Layout>
      <h1 className="text-2xl font-display font-medium brand-text-gradient mb-1">Recordings</h1>
      <div className="brand-stripe w-16 mb-4" />
      <p className="text-textMuted text-sm mb-5">Anruf-Aufnahmen hochladen — du entscheidest selbst, ob sie in den Ordner "Positiv" oder "Negativ" kommen, die KI liefert dazu eine ausführliche inhaltliche Auswertung.</p>

      {error && <div className="card border border-coral/40 text-coral text-sm mb-4">{error}</div>}

      <div className="card mb-6">
        <div className="font-semibold text-textMain text-sm mb-3">Neue Aufnahme hochladen</div>
        <div className="flex flex-col gap-2.5">
          <input className="input" placeholder="Kontext (optional, z.B. Kaltakquise, Bestandskunde)" value={label} onChange={(e) => setLabel(e.target.value)} />
          <label className="btn-ghost text-xs cursor-pointer inline-flex items-center gap-1.5 w-fit">
            <Icon name="mic" size={12} /> {file ? file.name : "Audio-Datei wählen (max. 15 MB)"}
            {/* Die Endungen stehen mit dabei, weil iPhones bei "audio/*"
                allein oft nur die Musik-Mediathek anbieten — Sprachnotizen
                und Dateien aus dem Datei-Manager tauchen dann gar nicht auf. */}
            <input type="file" accept="audio/*,.mp3,.m4a,.mp4,.aac,.wav,.ogg,.opus,.amr,.3gp,.caf,.webm,.flac"
              className="hidden" onChange={(e) => setFile(e.target.files[0] || null)} />
          </label>
          <select className="input" value={leadId} onChange={(e) => setLeadId(e.target.value)}>
            <option value="">Keinem Kunden zuordnen (optional)</option>
            {myLeads.map((l) => (
              <option key={l.id} value={l.id}>{l.name}{l.company ? ` (${l.company})` : ""}</option>
            ))}
          </select>
          <div>
            <div className="text-[10.5px] uppercase tracking-wide text-textMuted mb-1.5">Ergebnis — in welchen Ordner soll die Aufnahme?</div>
            <div className="flex items-center gap-2">
              {[["positiv", "Positiv"], ["negativ", "Negativ"]].map(([key, l]) => (
                <button key={key} onClick={() => setOutcome(key)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${outcome === key ? (key === "positiv" ? "bg-teal text-[var(--org-button-text,#fff)] border-teal" : "bg-coral text-[var(--org-button-text,#fff)] border-coral") : "border-line text-textMuted hover:text-textMain"}`}>
                  {l}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {[["private", "Nur für mich"], ["team_lead", "Teamlead/Manager"], ["org", "Ganzes Unternehmen"]].map(([key, l]) => (
              <button key={key} onClick={() => setVisibility(key)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${visibility === key ? "bg-amber text-[var(--org-button-text,#fff)] border-amber" : "border-line text-textMuted hover:text-textMain"}`}>
                {l}
              </button>
            ))}
            <button disabled={uploading || !file || !outcome} onClick={upload} className="btn text-xs ml-auto disabled:opacity-40">
              {uploading ? "Lädt hoch..." : "Hochladen & auswerten"}
            </button>
          </div>
        </div>
      </div>

      <div className="card flex items-center gap-2 mb-3">
        <Icon name="search" size={15} />
        <input
          className="bg-transparent border-none outline-none text-sm flex-1 text-textMain"
          placeholder="Aufnahmen durchsuchen (Kontext, Kunde, Ersteller:in, Auswertung)..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      <div className="flex items-center gap-2 mb-3">
        {[["all", "Alle"], ["positiv", "Positiv"], ["negativ", "Negativ"]].map(([key, l]) => (
          <button key={key} onClick={() => setOutcomeFilter(key)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${outcomeFilter === key ? "bg-amber text-[var(--org-button-text,#fff)] border-amber" : "border-line text-textMuted hover:text-textMain"}`}>
            {l}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-3">
        {filteredRecordings.map((r) => {
          const owner = profileMap[r.created_by];
          const isOwn = r.created_by === selfId;
          const expanded = expandedId === r.id;
          const isEditing = editingId === r.id;
          const assignedLead = r.lead_id ? leadMap[r.lead_id] : null;

          if (isEditing) {
            return (
              <div key={r.id} className="card">
                <div className="font-semibold text-textMain text-sm mb-3">Aufnahme bearbeiten</div>
                <div className="flex flex-col gap-2.5">
                  <input className="input" placeholder="Kontext/Titel" value={editLabel} onChange={(e) => setEditLabel(e.target.value)} />
                  <select className="input" value={editLeadId} onChange={(e) => setEditLeadId(e.target.value)}>
                    <option value="">Keinem Kunden zuordnen</option>
                    {myLeads.map((l) => (
                      <option key={l.id} value={l.id}>{l.name}{l.company ? ` (${l.company})` : ""}</option>
                    ))}
                  </select>
                  <div className="flex items-center gap-2 flex-wrap">
                    {[["positiv", "Positiv"], ["negativ", "Negativ"]].map(([key, l]) => (
                      <button key={key} onClick={() => setEditOutcome(key)}
                        className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${editOutcome === key ? (key === "positiv" ? "bg-teal text-[var(--org-button-text,#fff)] border-teal" : "bg-coral text-[var(--org-button-text,#fff)] border-coral") : "border-line text-textMuted hover:text-textMain"}`}>
                        {l}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {[["private", "Nur für mich"], ["team_lead", "Teamlead/Manager"], ["org", "Ganzes Unternehmen"]].map(([key, l]) => (
                      <button key={key} onClick={() => setEditVisibility(key)}
                        className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${editVisibility === key ? "bg-amber text-[var(--org-button-text,#fff)] border-amber" : "border-line text-textMuted hover:text-textMain"}`}>
                        {l}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    <button disabled={savingEdit} onClick={() => saveEdit(r.id)} className="btn text-xs disabled:opacity-40">
                      {savingEdit ? "Speichert..." : "Speichern"}
                    </button>
                    <button disabled={savingEdit} onClick={() => setEditingId(null)} className="btn-ghost text-xs">Abbrechen</button>
                  </div>
                </div>
              </div>
            );
          }

          return (
            <div key={r.id} className="card">
              <div className="flex items-start justify-between gap-3 mb-2 flex-wrap">
                <div className="min-w-0">
                  <div className="font-display font-semibold text-textMain flex items-center gap-2 flex-wrap">
                    {r.label || "Ohne Kontext"}
                    {r.visibility === "org" && <span className="text-[10px] uppercase tracking-wide text-violet border border-violet/40 rounded px-1.5 py-0.5">Ganzes Unternehmen</span>}
                    {r.visibility === "team_lead" && <span className="text-[10px] uppercase tracking-wide text-amber border border-amber/40 rounded px-1.5 py-0.5">Teamlead/Manager</span>}
                    {r.status === "evaluated" && r.evaluation_score != null && (
                      <span className="text-[10px] uppercase tracking-wide text-teal border border-teal/40 rounded px-1.5 py-0.5">Score {r.evaluation_score}</span>
                    )}
                    {r.outcome === "positiv" && (
                      <span className="text-[10px] uppercase tracking-wide text-teal border border-teal/40 rounded px-1.5 py-0.5">Positiv</span>
                    )}
                    {r.outcome === "negativ" && (
                      <span className="text-[10px] uppercase tracking-wide text-coral border border-coral/40 rounded px-1.5 py-0.5">Negativ</span>
                    )}
                  </div>
                  {assignedLead && (
                    <div className="text-xs text-textMuted mt-1">🔗 {assignedLead.name}{assignedLead.company ? ` (${assignedLead.company})` : ""}</div>
                  )}
                  {!isOwn && owner && (
                    <button onClick={() => openProfile(owner.id)} className="flex items-center gap-1.5 text-xs text-textMuted mt-1 hover:text-textMain">
                      <Avatar name={owner.full_name || "?"} src={owner.avatar_url} size={16} /> {owner.full_name || "Unbenannt"}
                    </button>
                  )}
                </div>
                <span className="text-[10.5px] text-textMuted flex-shrink-0">{STATUS_LABELS[r.status]}</span>
              </div>

              {r.status === "evaluated" && r.evaluation_summary && (
                <div className="mb-2">
                  <AIBadge label="KI-Auswertung" title="Diese Analyse wurde automatisch von einer KI erstellt." className="mb-1.5 inline-block" />
                  <p className="text-sm text-textMain">{r.evaluation_summary}</p>
                </div>
              )}

              <div className="flex items-center gap-2 flex-wrap pt-2 border-t border-line">
                <button onClick={() => togglePlay(r)} className="btn-ghost text-xs">
                  <Icon name="mic" size={12} /> {playingId === r.id ? "Aufnahme ausblenden" : "Aufnahme abspielen"}
                </button>
                {r.status === "evaluated" && (
                  <button onClick={() => setExpandedId(expanded ? null : r.id)} className="btn-ghost text-xs">
                    {expanded ? "Details ausblenden" : "Details anzeigen"}
                  </button>
                )}
                {isOwn && (
                  <button onClick={() => startEdit(r)} className="btn-ghost text-xs">Bearbeiten</button>
                )}
                {(isOwn) && (
                  <button onClick={() => deleteRecording(r.id)} className="btn-ghost text-xs text-coral ml-auto">Löschen</button>
                )}
              </div>
              {playingId === r.id && playingUrl && <AudioPlayer src={playingUrl} />}
              {expanded && r.evaluation_detail && (
                <div className="mt-3 pt-3 border-t border-line flex flex-col gap-3">
                  {r.evaluation_detail.gespraechsstruktur && (
                    <div>
                      <div className="text-[10.5px] uppercase tracking-wide text-textMuted mb-1">Gesprächsaufbau</div>
                      <p className="text-xs text-textMuted">{r.evaluation_detail.gespraechsstruktur}</p>
                    </div>
                  )}
                  {r.evaluation_detail.phasen?.length > 0 && (
                    <div>
                      <div className="text-[10.5px] uppercase tracking-wide text-textMuted mb-1">Gesprächsphasen</div>
                      <div className="flex flex-col gap-2">
                        {r.evaluation_detail.phasen.map((p, i) => (
                          <div key={i} className="text-xs">
                            <div className="text-textMain font-semibold">
                              {p.phase}{p.anteil && <span className="text-textMuted font-normal"> · {p.anteil}</span>}
                            </div>
                            {p.kernpunkte?.length > 0 && (
                              <ul className="text-textMuted list-disc pl-4 space-y-0.5 mt-0.5">
                                {p.kernpunkte.map((k, ki) => <li key={ki}>{k}</li>)}
                              </ul>
                            )}
                            <div className="text-textMuted mt-0.5">{p.bewertung}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {(r.evaluation_detail.tonalitaet || r.evaluation_detail.anrede) && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {r.evaluation_detail.tonalitaet && (
                        <div>
                          <div className="text-[10.5px] uppercase tracking-wide text-textMuted mb-1">Tonalität</div>
                          <p className="text-xs text-textMuted">{r.evaluation_detail.tonalitaet}</p>
                        </div>
                      )}
                      {r.evaluation_detail.anrede && (
                        <div>
                          <div className="text-[10.5px] uppercase tracking-wide text-textMuted mb-1">Anrede (Sie/Du)</div>
                          <p className="text-xs text-textMuted">{r.evaluation_detail.anrede}</p>
                        </div>
                      )}
                    </div>
                  )}
                  {r.evaluation_detail.staerken?.length > 0 && (
                    <div>
                      <div className="text-[10.5px] uppercase tracking-wide text-teal mb-1">Stärken</div>
                      <ul className="text-xs text-textMuted list-disc pl-4 space-y-0.5">
                        {r.evaluation_detail.staerken.map((s, i) => <li key={i}>{s}</li>)}
                      </ul>
                    </div>
                  )}
                  {r.evaluation_detail.verbesserung?.length > 0 && (
                    <div>
                      <div className="text-[10.5px] uppercase tracking-wide text-amber mb-1">Verbesserung</div>
                      <ul className="text-xs text-textMuted list-disc pl-4 space-y-0.5">
                        {r.evaluation_detail.verbesserung.map((s, i) => <li key={i}>{s}</li>)}
                      </ul>
                    </div>
                  )}
                  {r.evaluation_detail.einwaende?.length > 0 && (
                    <div>
                      <div className="text-[10.5px] uppercase tracking-wide text-coral mb-1">Einwände</div>
                      <div className="flex flex-col gap-2">
                        {r.evaluation_detail.einwaende.map((e, i) => (
                          <div key={i} className="text-xs">
                            <div className="text-textMain">„{e.einwand}"</div>
                            <div className="text-textMuted mt-0.5">Reaktion: {e.reaktion}</div>
                            <div className="text-textMuted italic">{e.bewertung}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {r.evaluation_detail.beispielsaetze?.length > 0 && (
                    <div>
                      <div className="text-[10.5px] uppercase tracking-wide text-violet mb-1">Beispielsätze</div>
                      <div className="flex flex-col gap-1.5">
                        {r.evaluation_detail.beispielsaetze.map((b, i) => (
                          <div key={i} className="text-xs">
                            <span className="text-textMuted">{b.moment}: </span>
                            <span className="text-textMain italic">„{b.satz}"</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {r.evaluation_detail.phrasenKorrektur?.length > 0 && (
                    <div>
                      <div className="text-[10.5px] uppercase tracking-wide text-amber mb-1">Gesagte Sätze — korrigiert</div>
                      <div className="flex flex-col gap-2">
                        {r.evaluation_detail.phrasenKorrektur.map((p, i) => (
                          <div key={i} className="text-xs">
                            <div className="text-textMuted line-through decoration-coral/60">„{p.original}"</div>
                            <div className="text-textMain">✓ „{p.verbessert}"</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {r.evaluation_detail.naechsteSchritte && (
                    <div>
                      <div className="text-[10.5px] uppercase tracking-wide text-textMuted mb-1">Nächste Schritte</div>
                      <p className="text-xs text-textMain">{r.evaluation_detail.naechsteSchritte}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {filteredRecordings.length === 0 && (
          <p className="text-textMuted text-sm">
            {recordings.length === 0 ? "Noch keine Aufnahmen hochgeladen." : q ? "Keine Aufnahmen gefunden." : "Keine Aufnahmen mit diesem Ergebnis."}
          </p>
        )}
      </div>
    </Layout>
  );
}

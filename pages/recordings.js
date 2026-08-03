import { useEffect, useState } from "react";
import Layout from "../components/Layout";
import Icon from "../components/Icon";
import Avatar from "../components/Avatar";
import { supabase } from "../lib/supabaseClient";
import { apiPost, apiGet } from "../lib/apiClient";
import { validateRecordingUpload } from "../lib/uploadValidation";
import { openProfile } from "../lib/profileModalBus";

const STATUS_LABELS = { pending: "Wird ausgewertet...", evaluated: "Ausgewertet", failed: "Auswertung fehlgeschlagen" };

export default function Recordings() {
  const [loading, setLoading] = useState(true);
  const [selfId, setSelfId] = useState(null);
  const [recordings, setRecordings] = useState([]);
  const [profileMap, setProfileMap] = useState({});
  const [label, setLabel] = useState("");
  const [visibility, setVisibility] = useState("private");
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [playingId, setPlayingId] = useState(null);
  const [playingUrl, setPlayingUrl] = useState(null);
  const [expandedId, setExpandedId] = useState(null);

  async function load() {
    setLoading(true);
    setError("");
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    setSelfId(session.user.id);

    // RLS regelt die Sichtbarkeit bereits vollständig (eigene + organisationsweit
    // freigegebene + Plattform-Admin sieht alles) — kein manueller Filter nötig.
    const { data, error: err } = await supabase.from("call_recordings").select("*").order("created_at", { ascending: false });
    if (err) setError(err.message);
    setRecordings(data || []);

    const otherIds = [...new Set((data || []).filter((r) => r.created_by !== session.user.id).map((r) => r.created_by))];
    if (otherIds.length) {
      const { data: profiles } = await supabase.from("profiles").select("id, full_name, avatar_url").in("id", otherIds);
      const map = {};
      (profiles || []).forEach((p) => { map[p.id] = p; });
      setProfileMap(map);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
    const interval = setInterval(load, 20000);
    return () => clearInterval(interval);
  }, []);

  async function upload() {
    if (!file) return;
    const validationError = validateRecordingUpload(file);
    if (validationError) { setError(validationError); return; }
    setUploading(true);
    setError("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const path = `${session.user.id}/${Date.now()}-${file.name}`;
      const { error: upErr } = await supabase.storage.from("call-recordings").upload(path, file);
      if (upErr) throw upErr;

      const { data: row, error: insErr } = await supabase.from("call_recordings").insert({
        created_by: session.user.id,
        label: label.trim() || null,
        recording_path: path,
        file_name: file.name,
        visibility,
      }).select().single();
      if (insErr) throw insErr;

      setLabel("");
      setFile(null);
      await load();

      // Auswertung im Hintergrund anstoßen — Liste zeigt "Wird ausgewertet..."
      // und aktualisiert sich per Polling automatisch, sobald fertig.
      apiPost("/api/call-recording-evaluate", { recordingId: row.id })
        .then(() => load())
        .catch((e) => console.error("call-recording-evaluate failed:", e.message));
    } catch (e) {
      setError(e.message || "Hochladen fehlgeschlagen.");
    } finally {
      setUploading(false);
    }
  }

  async function deleteRecording(id) {
    if (!confirm("Aufnahme wirklich löschen?")) return;
    await supabase.from("call_recordings").delete().eq("id", id);
    await load();
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

  return (
    <Layout>
      <h1 className="text-2xl font-display font-bold brand-text-gradient mb-1">Recordings</h1>
      <div className="brand-stripe w-16 mb-4" />
      <p className="text-textMuted text-sm mb-5">Anruf-Aufnahmen hochladen — die KI wertet sie automatisch aus, egal ob das Gespräch gut oder schlecht gelaufen ist.</p>

      {error && <div className="card border border-coral/40 text-coral text-sm mb-4">{error}</div>}

      <div className="card mb-6">
        <div className="font-semibold text-textMain text-sm mb-3">Neue Aufnahme hochladen</div>
        <div className="flex flex-col gap-2.5">
          <input className="input" placeholder="Kontext (optional, z.B. Kaltakquise, Bestandskunde)" value={label} onChange={(e) => setLabel(e.target.value)} />
          <label className="btn-ghost text-xs cursor-pointer inline-flex items-center gap-1.5 w-fit">
            <Icon name="mic" size={12} /> {file ? file.name : "Audio-Datei wählen (max. 15 MB)"}
            <input type="file" accept="audio/*" className="hidden" onChange={(e) => setFile(e.target.files[0] || null)} />
          </label>
          <div className="flex items-center gap-2">
            {[["private", "Nur für mich"], ["org", "Ganzes Unternehmen"]].map(([key, l]) => (
              <button key={key} onClick={() => setVisibility(key)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${visibility === key ? "bg-amber text-[var(--org-button-text,#fff)] border-amber" : "border-line text-textMuted hover:text-textMain"}`}>
                {l}
              </button>
            ))}
            <button disabled={uploading || !file} onClick={upload} className="btn text-xs ml-auto disabled:opacity-40">
              {uploading ? "Lädt hoch..." : "Hochladen & auswerten"}
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {recordings.map((r) => {
          const owner = profileMap[r.created_by];
          const isOwn = r.created_by === selfId;
          const expanded = expandedId === r.id;
          return (
            <div key={r.id} className="card">
              <div className="flex items-start justify-between gap-3 mb-2 flex-wrap">
                <div className="min-w-0">
                  <div className="font-display font-semibold text-textMain flex items-center gap-2 flex-wrap">
                    {r.label || "Ohne Kontext"}
                    {r.visibility === "org" && <span className="text-[10px] uppercase tracking-wide text-violet border border-violet/40 rounded px-1.5 py-0.5">Team</span>}
                    {r.status === "evaluated" && r.evaluation_score != null && (
                      <span className="text-[10px] uppercase tracking-wide text-teal border border-teal/40 rounded px-1.5 py-0.5">Score {r.evaluation_score}</span>
                    )}
                  </div>
                  {!isOwn && owner && (
                    <button onClick={() => openProfile(owner.id)} className="flex items-center gap-1.5 text-xs text-textMuted mt-1 hover:text-textMain">
                      <Avatar name={owner.full_name || "?"} src={owner.avatar_url} size={16} /> {owner.full_name || "Unbenannt"}
                    </button>
                  )}
                </div>
                <span className="text-[10.5px] text-textMuted flex-shrink-0">{STATUS_LABELS[r.status]}</span>
              </div>

              {r.status === "evaluated" && r.evaluation_summary && (
                <p className="text-sm text-textMain mb-2">{r.evaluation_summary}</p>
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
                {(isOwn) && (
                  <button onClick={() => deleteRecording(r.id)} className="btn-ghost text-xs text-coral ml-auto">Löschen</button>
                )}
              </div>
              {playingId === r.id && playingUrl && (
                <audio controls autoPlay src={playingUrl} className="w-full mt-2" />
              )}
              {expanded && r.evaluation_detail && (
                <div className="mt-3 pt-3 border-t border-line flex flex-col gap-3">
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
                </div>
              )}
            </div>
          );
        })}
        {recordings.length === 0 && <p className="text-textMuted text-sm">Noch keine Aufnahmen hochgeladen.</p>}
      </div>
    </Layout>
  );
}

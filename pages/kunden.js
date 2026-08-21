import { useEffect, useState } from "react";
import Layout from "../components/Layout";
import Avatar from "../components/Avatar";
import { supabase } from "../lib/supabaseClient";
import { openProfile } from "../lib/profileModalBus";
import { ABSTAND } from "../lib/autoRefresh";
import { meldeTerminAenderung } from "../lib/leadNotify";
import { loescheGeprueft, aendereGeprueft } from "../lib/loeschen";
import { getActiveOrgId } from "../lib/activeOrg";
import { apiGet } from "../lib/apiClient";
import AudioPlayer from "../components/AudioPlayer";
import { DEFAULT_LEAD_FIELDS, resolveLeadFields, getLeadFieldValue } from "../lib/leadFields";
import { terminMitZusatz } from "../lib/terminzeit";
import { getZeitzone } from "../lib/zeit";

const STATUS_LABEL = { geplant: "Geplant", wahrgenommen: "Wahrgenommen", abgesagt: "Abgesagt" };
// Diese Felder stehen schon im Kopf oder als eigene Zeile — sie sollen nicht
// ein zweites Mal aus der Feld-Konfiguration der Organisation auftauchen.
const SCHON_GEZEIGT = ["name", "company", "phone", "email", "website", "notes"];

const emptyForm = { name: "", phone: "", email: "", company: "", website: "", notes: "" };

const TABS = [
  ["kunde", "Kunden"],
  ["absage", "Absagen"],
];

export default function Kunden() {
  const [loading, setLoading] = useState(true);
  const [selfId, setSelfId] = useState(null);
  const [canDeleteTeam, setCanDeleteTeam] = useState(false);
  const [canSeeTeam, setCanSeeTeam] = useState(false);
  const [viewMode, setViewMode] = useState("own"); // 'own' | 'team'
  const [outcomeTab, setOutcomeTab] = useState("kunde"); // 'kunde' | 'absage'
  const [customers, setCustomers] = useState([]);
  const [profileMap, setProfileMap] = useState({});
  const [error, setError] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(emptyForm);
  const [confirmDelete, setConfirmDelete] = useState(null);
  // Die Liste zeigt nur Namen. Ein Klick öffnet einen Eintrag und zeigt
  // alles, was zu ihm gespeichert ist — bis hin zur Aufnahme.
  const [offenId, setOffenId] = useState(null);
  const [aufnahmeUrl, setAufnahmeUrl] = useState(null);
  const [aufnahmeId, setAufnahmeId] = useState(null);
  const [leadFields, setLeadFields] = useState(DEFAULT_LEAD_FIELDS);

  async function load(silent) {
    if (!silent) setLoading(true);
    setError("");
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const { data: me } = await supabase.from("profiles").select("role, is_admin, is_platform_admin, organization_id").eq("id", session.user.id).maybeSingle();
    // Zusatzfelder der Organisation, damit im Detail auch das auftaucht, was
    // sich eine Firma selbst angelegt hat (siehe lib/leadFields.js).
    const orgId = getActiveOrgId(me);
    if (orgId) {
      const { data: org } = await supabase.from("organizations").select("lead_field_config").eq("id", orgId).maybeSingle();
      setLeadFields(resolveLeadFields(org));
    }
    const canManage = !!(me?.role === "manager" || me?.role === "backend" || me?.is_admin || me?.is_platform_admin);
    setCanSeeTeam(canManage);
    setSelfId(session.user.id);
    // "backend" darf Leads laut RLS zwar einsehen/bearbeiten, aber nicht
    // löschen (leads_delete) — der Löschen-Button darf für fremde Einträge
    // deshalb nur bei Manager/Admin/Plattform-Admin erscheinen.
    setCanDeleteTeam(!!(me?.role === "manager" || me?.is_admin || me?.is_platform_admin));
    if (me?.role === "backend" && viewMode === "own") { setViewMode("team"); return; }

    let query = supabase.from("leads").select("*").eq("outcome", outcomeTab).order("created_at", { ascending: false });
    if (!(canManage && viewMode === "team")) query = query.eq("created_by", session.user.id);
    const { data: rows, error: err } = await query;
    if (err) setError(err.message);
    setCustomers(rows || []);

    if (canManage && viewMode === "team") {
      const creatorIds = [...new Set((rows || []).map((l) => l.created_by))];
      if (creatorIds.length) {
        const { data: profiles } = await supabase.from("profiles").select("id, full_name, avatar_url").in("id", creatorIds);
        const map = {};
        (profiles || []).forEach((p) => { map[p.id] = p; });
        setProfileMap(map);
      }
    }
    if (!silent) setLoading(false);
  }

  useEffect(() => {
    load();
    // Nur abfragen, wenn der Tab sichtbar ist; beim Zurückwechseln sofort.
    // Abstand: keine Echtzeit, ändert sich selten.
    const interval = setInterval(() => { if (!document.hidden) (() => load(true))(); }, ABSTAND.GELEGENTLICH);
    const beiSichtbar = () => { if (!document.hidden) (() => load(true))(); };
    document.addEventListener("visibilitychange", beiSichtbar);
    return () => { clearInterval(interval); document.removeEventListener("visibilitychange", beiSichtbar); };
  }, [viewMode, outcomeTab]);

  async function addCustomer() {
    if (!form.name.trim()) { setError("Name ist erforderlich."); return; }
    setSaving(true);
    setError("");
    const { data: { session } } = await supabase.auth.getSession();
    const { error: err } = await supabase.from("leads").insert({
      created_by: session.user.id,
      name: form.name.trim(),
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      company: form.company.trim() || null,
      website: form.website.trim() || null,
      notes: form.notes.trim() || null,
      outcome: "kunde",
    });
    if (err) { setError(err.message); setSaving(false); return; }
    setForm(emptyForm);
    setShowAddForm(false);
    setSaving(false);
    await load();
  }

  function startEdit(c) {
    setEditingId(c.id);
    setEditForm({
      name: c.name || "",
      phone: c.phone || "",
      email: c.email || "",
      company: c.company || "",
      website: c.website || "",
      notes: c.notes || "",
    });
  }

  async function saveEdit(id) {
    if (!editForm.name.trim()) { setError("Name ist erforderlich."); return; }
    setSaving(true);
    setError("");
    const err = await aendereGeprueft(supabase.from("leads").update({
      name: editForm.name.trim(),
      phone: editForm.phone.trim() || null,
      email: editForm.email.trim() || null,
      company: editForm.company.trim() || null,
      website: editForm.website.trim() || null,
      notes: editForm.notes.trim() || null,
    }).eq("id", id), "Diesen Eintrag darf nur bearbeiten, wer ihn angelegt hat, oder ein Manager.");
    if (err) { setError(err); setSaving(false); return; }
    meldeTerminAenderung(id, "bearbeitet", "Die Kontaktdaten wurden bearbeitet.");
    setEditingId(null);
    setSaving(false);
    await load();
  }

  async function deleteCustomer(id) {
    setSaving(true);
    const lead = customers.find((c) => c.id === id);
    // Vor dem Löschen melden und abwarten — danach wäre der Eintrag für die
    // Melde-Route nicht mehr lesbar (siehe lib/leadNotify.js).
    await meldeTerminAenderung(id, "geloescht", "Der Eintrag wurde gelöscht.");
    const loeschFehler = await loescheGeprueft(supabase.from("leads").delete().eq("id", id), "Diesen Eintrag darf nur löschen, wer ihn angelegt hat, oder ein Manager.");
    const err = loeschFehler ? { message: loeschFehler } : null;
    if (err) { setError(err.message); setSaving(false); return; }
    // Ohne das hier würde die eigentliche Audiodatei im Speicher liegen
    // bleiben — nur der Datenbank-Eintrag verschwindet sonst (DSGVO: Löschung
    // muss auch die Datei selbst treffen, nicht nur die Metadaten).
    if (lead?.recording_path) {
      await supabase.storage.from("lead-recordings").remove([lead.recording_path]);
    }
    setConfirmDelete(null);
    setSaving(false);
    await load();
  }

  // Aufnahme: die Datei liegt in einem privaten Bucket, die Adresse holt
  // die Route und ist nur kurz gültig (siehe pages/api/lead-recording-url.js).
  async function aufnahmeUmschalten(lead) {
    if (aufnahmeId === lead.id) { setAufnahmeId(null); setAufnahmeUrl(null); return; }
    try {
      const { url } = await apiGet(`/api/lead-recording-url?leadId=${lead.id}`);
      setAufnahmeId(lead.id);
      setAufnahmeUrl(url);
    } catch (e) {
      setError(e.message || "Die Aufnahme konnte nicht geladen werden.");
    }
  }

  // Deutsche Uhrzeit ist massgeblich, die eigene Ortszeit nur bei Abweichung.
  function terminZeile(iso) {
    if (!iso) return null;
    const { haupt, zusatz } = terminMitZusatz(iso, getZeitzone() || undefined);
    return zusatz ? `${haupt} Uhr (bei dir ${zusatz})` : `${haupt} Uhr`;
  }

  function eintragOeffnen(id) {
    setOffenId((v) => (v === id ? null : id));
    // Eine laufende Aufnahme gehört zum Eintrag, nicht zur Seite.
    setAufnahmeId(null);
    setAufnahmeUrl(null);
  }

  if (loading) return <Layout><p className="text-textMuted text-sm">Lädt...</p></Layout>;

  return (
    <Layout>
      <h1 className="text-2xl font-display font-medium brand-text-gradient mb-1">Erfolge und Abschlüsse</h1>
      <div className="brand-stripe w-16 mb-4" />
      <p className="text-textMuted text-sm mb-5">Kunden, die aus einem Termin geworden sind — oder direkt manuell eingetragen. Absagen findest du im entsprechenden Reiter.</p>

      <div className="flex items-center gap-2 mb-3">
        {TABS.map(([key, label]) => (
          <button key={key} onClick={() => { setOutcomeTab(key); setShowAddForm(false); setEditingId(null); }}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${outcomeTab === key ? "bg-amber text-[var(--org-button-text,#fff)] border-amber" : "border-line text-textMuted hover:text-textMain"}`}>
            {label}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between gap-2 mb-5 flex-wrap">
        {canSeeTeam ? (
          <div className="flex items-center gap-2">
            {[["own", "Meine"], ["team", "Alle im Team"]].map(([key, label]) => (
              <button key={key} onClick={() => setViewMode(key)} className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${viewMode === key ? "bg-amber text-[var(--org-button-text,#fff)] border-amber" : "border-line text-textMuted hover:text-textMain"}`}>
                {label}
              </button>
            ))}
          </div>
        ) : <div />}
        {outcomeTab === "kunde" && (
          <button onClick={() => setShowAddForm(!showAddForm)} className="btn text-xs">
            {showAddForm ? "Abbrechen" : "+ Erfolg hinzufügen"}
          </button>
        )}
      </div>

      {showAddForm && (
        <div className="card mb-5">
          <div className="font-semibold text-textMain text-sm mb-3">Neuen Kunden/Abschluss eintragen</div>
          <div className="flex flex-col gap-2.5">
            <input className="input" placeholder="Name *" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <div className="grid grid-cols-2 gap-2.5">
              <input className="input" placeholder="Telefon" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              <input className="input" placeholder="E-Mail" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              <input className="input" placeholder="Unternehmen" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
              <input className="input" placeholder="Website" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} />
            </div>
            <textarea className="input" placeholder="Notiz (optional)" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            <button disabled={saving} onClick={addCustomer} className="btn text-xs w-fit disabled:opacity-40">
              {saving ? "Speichert..." : "Speichern"}
            </button>
          </div>
        </div>
      )}

      {error && <div className="card border border-coral/40 text-coral text-sm mb-4">{error}</div>}

      <div className="flex flex-col gap-3">
        {customers.map((c) => {
          const owner = profileMap[c.created_by];
          const isEditing = editingId === c.id;
          // Beim Löschen offen halten — sonst verschwindet die Rückfrage,
          // sobald die Maus wegwandert.
          const offen = isEditing || offenId === c.id;
          return (
            <div key={c.id} className="card">
              {isEditing ? (
                <div className="flex flex-col gap-2.5">
                  <input className="input" placeholder="Name *" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
                  <div className="grid grid-cols-2 gap-2.5">
                    <input className="input" placeholder="Telefon" value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} />
                    <input className="input" placeholder="E-Mail" value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} />
                    <input className="input" placeholder="Unternehmen" value={editForm.company} onChange={(e) => setEditForm({ ...editForm, company: e.target.value })} />
                    <input className="input" placeholder="Website" value={editForm.website} onChange={(e) => setEditForm({ ...editForm, website: e.target.value })} />
                  </div>
                  <textarea className="input" placeholder="Notiz (optional)" rows={2} value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} />
                  <div className="flex items-center gap-2">
                    <button disabled={saving} onClick={() => saveEdit(c.id)} className="btn text-xs disabled:opacity-40">
                      {saving ? "Speichert..." : "Speichern"}
                    </button>
                    <button disabled={saving} onClick={() => setEditingId(null)} className="btn-ghost text-xs">Abbrechen</button>
                  </div>
                </div>
              ) : (
                <>
                  {/* Ein Klick auf den Namen öffnet den Eintrag — und zeigt
                      alles, was zu ihm gespeichert ist. */}
                  <button type="button"
                    onClick={() => eintragOeffnen(c.id)}
                    aria-expanded={offen}
                    className="w-full text-left flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0 flex items-center gap-2">
                      <span className={`text-textMuted text-xs transition-transform ${offen ? "rotate-90" : ""}`}>›</span>
                      <span className="font-display font-semibold text-textMain">{c.name}</span>
                    </div>
                    <span className={`text-[10px] uppercase tracking-wide rounded px-1.5 py-0.5 flex-shrink-0 border ${outcomeTab === "kunde" ? "text-teal border-teal/40" : "text-coral border-coral/40"}`}>
                      {outcomeTab === "kunde" ? "Kunde" : "Absage"}
                    </span>
                  </button>
                  {offen && (
                  <>
                  <div className="text-xs text-textMuted mt-2 mb-2">{c.company || "Kein Unternehmen angegeben"}</div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-textMuted">
                    {c.phone && <span>📞 {c.phone}</span>}
                    {c.email && <span>✉️ {c.email}</span>}
                    {c.website && <span>🌐 {c.website}</span>}
                    {viewMode === "team" && owner && (
                      <button onClick={() => openProfile(owner.id)} className="flex items-center gap-1.5 hover:text-textMain">
                        <Avatar name={owner.full_name || "?"} src={owner.avatar_url} size={16} /> {owner.full_name || "Unbenannt"}
                      </button>
                    )}
                  </div>
                  {c.notes && <p className="text-sm text-textMain mt-2">{c.notes}</p>}

                  {/* Termin-Zeitpunkt, Status und alles, was die Organisation
                      sich an eigenen Feldern angelegt hat. */}
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-textMuted mt-2">
                    {terminZeile(c.appointment_at) && <span>🗓️ {terminZeile(c.appointment_at)}</span>}
                    {c.status && <span>Status: {STATUS_LABEL[c.status] || c.status}</span>}
                    {c.is_decision_maker && <span>✅ Entscheider:in</span>}
                    {c.follow_up_of && <span>↩︎ Folgetermin</span>}
                    <span>Angelegt: {new Date(c.created_at).toLocaleDateString("de-DE")}</span>
                  </div>
                  {leadFields
                    .filter((f) => !SCHON_GEZEIGT.includes(f.key))
                    .map((f) => [f, getLeadFieldValue(c, f)])
                    .filter(([, wert]) => wert !== undefined && wert !== null && wert !== "" && wert !== false)
                    .map(([f, wert]) => (
                      <div key={f.key} className="text-xs text-textMuted mt-1">
                        <span className="text-textMain">{f.label}:</span> {wert === true ? "Ja" : String(wert)}
                      </div>
                    ))}

                  {c.recording_path && (
                    <div className="mt-3">
                      <button onClick={() => aufnahmeUmschalten(c)} className="btn-ghost text-xs">
                        🎧 {aufnahmeId === c.id ? "Aufnahme ausblenden" : "Aufnahme abspielen"}
                      </button>
                      {aufnahmeId === c.id && aufnahmeUrl && <AudioPlayer src={aufnahmeUrl} />}
                    </div>
                  )}

                  {(c.call_notes_status || c.call_notes) && (
                    <div className="card !py-3 !px-3.5 mt-3 border border-violet/30">
                      <div className="text-[10.5px] uppercase tracking-wide text-violet mb-1.5">Notizen aus der Aufnahme</div>
                      {c.call_notes_status === "pending" && <p className="text-xs text-textMuted">Wird erstellt — das dauert einen Moment.</p>}
                      {c.call_notes_status === "failed" && <p className="text-xs text-coral">Konnte nicht erstellt werden.</p>}
                      {c.call_notes && (
                        <>
                          {c.call_notes.zusammenfassung && <p className="text-sm text-textMain mb-2">{c.call_notes.zusammenfassung}</p>}
                          {[["bedarf", "Bedarf"], ["einwaende", "Einwände"], ["vereinbarungen", "Vereinbarungen"], ["naechsteSchritte", "Nächste Schritte"], ["sonstiges", "Sonstiges"]].map(([k, titel]) => {
                            const eintraege = c.call_notes[k];
                            if (!Array.isArray(eintraege) || !eintraege.length) return null;
                            return (
                              <div key={k} className="mb-1.5">
                                <div className="text-[11px] font-semibold text-textMain">{titel}</div>
                                <ul className="list-disc pl-4 text-xs text-textMuted">
                                  {eintraege.map((e, i) => <li key={i}>{e}</li>)}
                                </ul>
                              </div>
                            );
                          })}
                        </>
                      )}
                    </div>
                  )}

                  <div className="flex items-center gap-2 mt-3 pt-2 border-t border-line flex-wrap">
                    {/* Kommentare und Aufgaben hängen am Termin selbst — dort
                        stehen sie schon, statt sie hier zu verdoppeln. */}
                    <a href={`/termine?leadId=${c.id}`} className="btn-ghost text-xs">Im Termin öffnen →</a>
                    <button onClick={() => startEdit(c)} className="btn-ghost text-xs">Bearbeiten</button>
                    {(c.created_by === selfId || canDeleteTeam) && (
                      confirmDelete === c.id ? (
                        <span className="flex items-center gap-1.5">
                          <span className="text-xs text-coral">Wirklich löschen?</span>
                          <button disabled={saving} onClick={() => deleteCustomer(c.id)} className="btn-ghost text-xs text-coral border-coral/40 disabled:opacity-40">Ja, löschen</button>
                          <button disabled={saving} onClick={() => setConfirmDelete(null)} className="btn-ghost text-xs">Abbrechen</button>
                        </span>
                      ) : (
                        <button onClick={() => setConfirmDelete(c.id)} className="btn-ghost text-xs text-coral">Löschen</button>
                      )
                    )}
                  </div>
                  </>
                  )}
                </>
              )}
            </div>
          );
        })}
        {customers.length === 0 && (
          <p className="text-textMuted text-sm">
            {outcomeTab === "kunde"
              ? 'Noch keine Kunden — markiere einen Termin unter "Termine" als "Kunde geworden" oder trage einen Erfolg oben direkt manuell ein.'
              : 'Noch keine Absagen — markiere einen Termin unter "Termine" als "Absage".'}
          </p>
        )}
      </div>
    </Layout>
  );
}

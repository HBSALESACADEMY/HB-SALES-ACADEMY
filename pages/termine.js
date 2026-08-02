import { useEffect, useState } from "react";
import Layout from "../components/Layout";
import Icon from "../components/Icon";
import Avatar from "../components/Avatar";
import { supabase } from "../lib/supabaseClient";
import { apiGet } from "../lib/apiClient";
import { openProfile } from "../lib/profileModalBus";

const STATUS_LABELS = { geplant: "Geplant", wahrgenommen: "Wahrgenommen", abgesagt: "Abgesagt" };
const STATUS_COLORS = { geplant: "amber", wahrgenommen: "teal", abgesagt: "coral" };
const OUTCOME_LABELS = { kunde: "Kunde geworden", follow_up: "Überlegt (Follow-up)", absage: "Absage" };
const OUTCOME_COLORS = { kunde: "teal", follow_up: "violet", absage: "coral" };

export default function Termine() {
  const [loading, setLoading] = useState(true);
  const [canSeeTeam, setCanSeeTeam] = useState(false);
  const [viewMode, setViewMode] = useState("own"); // 'own' | 'team'
  const [leads, setLeads] = useState([]);
  const [profileMap, setProfileMap] = useState({});
  const [selfId, setSelfId] = useState(null);
  const [playingId, setPlayingId] = useState(null);
  const [playingUrl, setPlayingUrl] = useState(null);
  const [error, setError] = useState("");
  const [followUpId, setFollowUpId] = useState(null);
  const [followUpDate, setFollowUpDate] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    setSelfId(session.user.id);

    const { data: me } = await supabase.from("profiles").select("role, is_admin, is_platform_admin").eq("id", session.user.id).maybeSingle();
    const canManage = !!(me?.role === "manager" || me?.role === "backend" || me?.is_admin || me?.is_platform_admin);
    setCanSeeTeam(canManage);
    // Backend-Accounts haben normalerweise keine eigenen Leads — direkt die
    // Team-Ansicht zeigen statt einer leeren "Meine"-Liste.
    if (me?.role === "backend" && viewMode === "own") { setViewMode("team"); return; }

    let query = supabase.from("leads").select("*").order("appointment_at", { ascending: true, nullsFirst: false });
    if (!(canManage && viewMode === "team")) query = query.eq("created_by", session.user.id);
    const { data: leadRows, error: leadErr } = await query;
    if (leadErr) setError(leadErr.message);
    setLeads(leadRows || []);

    if (canManage && viewMode === "team") {
      const creatorIds = [...new Set((leadRows || []).map((l) => l.created_by))];
      if (creatorIds.length) {
        const { data: profiles } = await supabase.from("profiles").select("id, full_name, avatar_url").in("id", creatorIds);
        const map = {};
        (profiles || []).forEach((p) => { map[p.id] = p; });
        setProfileMap(map);
      }
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
    const interval = setInterval(load, 20000);
    return () => clearInterval(interval);
  }, [viewMode]);

  async function updateStatus(id, status) {
    await supabase.from("leads").update({ status }).eq("id", id);
    setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, status } : l)));
  }

  async function markOutcome(id, outcome) {
    if (outcome === "follow_up") {
      // Erst Datum für den Folgetermin abfragen, statt sofort zu speichern.
      setFollowUpId(id);
      setFollowUpDate("");
      return;
    }
    await supabase.from("leads").update({ outcome }).eq("id", id);
    setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, outcome } : l)));
  }

  async function saveFollowUp(id) {
    if (!followUpDate) return;
    const patch = { outcome: "follow_up", appointment_at: new Date(followUpDate).toISOString(), status: "geplant" };
    await supabase.from("leads").update(patch).eq("id", id);
    setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
    setFollowUpId(null);
    setFollowUpDate("");
  }

  async function togglePlay(lead) {
    if (playingId === lead.id) { setPlayingId(null); setPlayingUrl(null); return; }
    try {
      const { url } = await apiGet(`/api/lead-recording-url?leadId=${lead.id}`);
      setPlayingId(lead.id);
      setPlayingUrl(url);
    } catch (e) {
      setError(e.message);
    }
  }

  function formatAppointment(iso) {
    if (!iso) return "Kein Termin-Zeitpunkt";
    const d = new Date(iso);
    return d.toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" }) + " · " + d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  }

  if (loading) return <Layout><p className="text-textMuted text-sm">Lädt...</p></Layout>;

  return (
    <Layout>
      <h1 className="text-2xl font-display font-bold brand-text-gradient mb-1">Termine</h1>
      <div className="brand-stripe w-16 mb-4" />
      <p className="text-textMuted text-sm mb-5">Beim Call Tracker erfasste Kundendaten und Termine.</p>

      {canSeeTeam && (
        <div className="flex items-center gap-2 mb-5">
          {[["own", "Meine"], ["team", "Alle im Team"]].map(([key, label]) => (
            <button key={key} onClick={() => setViewMode(key)} className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${viewMode === key ? "bg-amber text-[var(--org-button-text,#fff)] border-amber" : "border-line text-textMuted hover:text-textMain"}`}>
              {label}
            </button>
          ))}
        </div>
      )}

      {error && <div className="card border border-coral/40 text-coral text-sm mb-4">{error}</div>}

      <div className="flex flex-col gap-3">
        {leads.map((lead) => {
          const owner = profileMap[lead.created_by];
          const statusColor = STATUS_COLORS[lead.status];
          return (
            <div key={lead.id} className="card">
              <div className="flex items-start justify-between gap-3 mb-2 flex-wrap">
                <div className="min-w-0">
                  <div className="font-display font-semibold text-textMain flex items-center gap-2 flex-wrap">
                    {lead.name}
                    {lead.is_decision_maker && <span className="text-[10px] uppercase tracking-wide text-violet border border-violet/40 rounded px-1.5 py-0.5">Entscheider</span>}
                    <span className={`text-[10px] uppercase tracking-wide text-${statusColor} border border-${statusColor}/40 rounded px-1.5 py-0.5`}>{STATUS_LABELS[lead.status]}</span>
                    {lead.outcome && (
                      <span className={`text-[10px] uppercase tracking-wide text-${OUTCOME_COLORS[lead.outcome]} border border-${OUTCOME_COLORS[lead.outcome]}/40 rounded px-1.5 py-0.5`}>
                        {OUTCOME_LABELS[lead.outcome]}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-textMuted mt-0.5">{lead.company || "Kein Unternehmen angegeben"}</div>
                </div>
                <div className="text-xs font-mono text-textMain flex-shrink-0">{formatAppointment(lead.appointment_at)}</div>
              </div>

              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-textMuted mb-2">
                {lead.phone && <span>📞 {lead.phone}</span>}
                {lead.email && <span>✉️ {lead.email}</span>}
                {lead.website && <span>🌐 {lead.website}</span>}
                {viewMode === "team" && owner && (
                  <button onClick={() => openProfile(owner.id)} className="flex items-center gap-1.5 hover:text-textMain">
                    <Avatar name={owner.full_name || "?"} src={owner.avatar_url} size={16} /> {owner.full_name || "Unbenannt"}
                  </button>
                )}
              </div>

              {lead.notes && <p className="text-sm text-textMain mb-2">{lead.notes}</p>}

              <div className="flex items-center gap-2 flex-wrap pt-2 border-t border-line">
                {Object.keys(STATUS_LABELS).map((s) => (
                  <button key={s} disabled={lead.status === s} onClick={() => updateStatus(lead.id, s)} className="btn-ghost text-xs disabled:opacity-30">
                    Als „{STATUS_LABELS[s]}" markieren
                  </button>
                ))}
                {lead.recording_path && (
                  <button onClick={() => togglePlay(lead)} className="btn-ghost text-xs ml-auto">
                    <Icon name="chat" size={12} /> {playingId === lead.id ? "Aufnahme ausblenden" : "Aufnahme abspielen"}
                  </button>
                )}
              </div>
              {playingId === lead.id && playingUrl && (
                <audio controls autoPlay src={playingUrl} className="w-full mt-2" />
              )}

              <div className="flex items-center gap-2 flex-wrap pt-2 border-t border-line mt-2">
                <span className="text-[11px] text-textMuted flex-shrink-0">Ergebnis:</span>
                {Object.keys(OUTCOME_LABELS).map((o) => (
                  <button key={o} disabled={lead.outcome === o && o !== "follow_up"} onClick={() => markOutcome(lead.id, o)} className="btn-ghost text-xs disabled:opacity-30">
                    {OUTCOME_LABELS[o]}
                  </button>
                ))}
              </div>
              {followUpId === lead.id && (
                <div className="flex items-center gap-2 mt-2">
                  <input type="datetime-local" className="input !py-1.5 text-xs flex-1" value={followUpDate} onChange={(e) => setFollowUpDate(e.target.value)} />
                  <button disabled={!followUpDate} onClick={() => saveFollowUp(lead.id)} className="btn-ghost text-xs disabled:opacity-40">Speichern</button>
                  <button onClick={() => setFollowUpId(null)} className="btn-ghost text-xs">Abbrechen</button>
                </div>
              )}
            </div>
          );
        })}
        {leads.length === 0 && <p className="text-textMuted text-sm">Noch keine Termine erfasst — beim "Terminiert"-Klick im Call Tracker landen sie hier.</p>}
      </div>
    </Layout>
  );
}

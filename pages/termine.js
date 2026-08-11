import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import Layout from "../components/Layout";
import Icon from "../components/Icon";
import Avatar from "../components/Avatar";
import AudioPlayer from "../components/AudioPlayer";
import { supabase } from "../lib/supabaseClient";
import { apiGet, apiPost } from "../lib/apiClient";
import { openProfile } from "../lib/profileModalBus";
import { getActiveOrgId } from "../lib/activeOrg";

const STATUS_LABELS = { geplant: "Geplant", wahrgenommen: "Wahrgenommen", abgesagt: "Abgesagt" };
const STATUS_COLORS = { geplant: "amber", wahrgenommen: "teal", abgesagt: "coral" };
const OUTCOME_LABELS = { kunde: "Kunde geworden", follow_up: "Überlegt (Follow-up)", absage: "Absage" };
const OUTCOME_COLORS = { kunde: "teal", follow_up: "violet", absage: "coral" };

export default function Termine() {
  const router = useRouter();
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
  const [highlightId, setHighlightId] = useState(null);
  const [notificationEmails, setNotificationEmails] = useState([]);
  const [newEmail, setNewEmail] = useState("");
  const [savingEmail, setSavingEmail] = useState(false);
  const [showEmailManager, setShowEmailManager] = useState(false);
  const [reminderSendingId, setReminderSendingId] = useState(null);
  const [reminderSentId, setReminderSentId] = useState(null);
  const [editingEmailId, setEditingEmailId] = useState(null);
  const [emailDraft, setEmailDraft] = useState("");
  const leadRefs = useRef({});

  async function load(silent) {
    if (!silent) setLoading(true);
    setError("");
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    setSelfId(session.user.id);

    const { data: me } = await supabase.from("profiles").select("role, is_admin, is_platform_admin, organization_id").eq("id", session.user.id).maybeSingle();
    const canManage = !!(me?.role === "manager" || me?.role === "backend" || me?.is_admin || me?.is_platform_admin);
    setCanSeeTeam(canManage);
    // Ein per E-Mail verlinkter Termin kann auch jemand anderem gehören —
    // dann automatisch in die Team-Ansicht wechseln, um ihn zu finden.
    const wantsTeamForDeepLink = !!router.query.leadId && canManage && viewMode === "own";
    // Backend-Accounts haben normalerweise keine eigenen Leads — direkt die
    // Team-Ansicht zeigen statt einer leeren "Meine"-Liste.
    if ((me?.role === "backend" || wantsTeamForDeepLink) && viewMode === "own") { setViewMode("team"); return; }

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

    if (canManage) {
      const activeOrgId = getActiveOrgId(me);
      if (activeOrgId) {
        const { data: emails } = await supabase.from("notification_emails").select("*").eq("organization_id", activeOrgId).order("created_at");
        setNotificationEmails(emails || []);
      }
    }
    if (!silent) setLoading(false);
  }

  useEffect(() => {
    if (!router.isReady) return;
    load();
    // silent=true: kein voller Seiten-Unmount bei jedem Poll, sonst würde
    // eine gerade abgespielte Aufnahme abrupt abbrechen.
    const interval = setInterval(() => load(true), 20000);
    return () => clearInterval(interval);
  }, [viewMode, router.isReady, router.query.leadId]);

  // Deep-Link aus der Termin-Benachrichtigungsmail (?leadId=...): zum
  // passenden Termin scrollen und ihn kurz hervorheben.
  useEffect(() => {
    const leadId = router.query.leadId;
    if (!leadId || !leads.length) return;
    const el = leadRefs.current[leadId];
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      setHighlightId(leadId);
      const t = setTimeout(() => setHighlightId(null), 4000);
      return () => clearTimeout(t);
    }
  }, [router.query.leadId, leads]);

  async function addNotificationEmail() {
    const email = newEmail.trim();
    if (!email) return;
    setSavingEmail(true);
    setError("");
    const { data: { session } } = await supabase.auth.getSession();
    const { data: me } = await supabase.from("profiles").select("organization_id, is_platform_admin").eq("id", session.user.id).maybeSingle();
    const activeOrgId = getActiveOrgId(me);
    const { error: err } = await supabase.from("notification_emails").insert({ organization_id: activeOrgId, email, created_by: session.user.id });
    setSavingEmail(false);
    if (err) { setError(err.message); return; }
    setNewEmail("");
    await load(true);
  }

  async function removeNotificationEmail(id) {
    const { error: err } = await supabase.from("notification_emails").delete().eq("id", id);
    if (err) { setError(err.message); return; }
    setNotificationEmails((prev) => prev.filter((e) => e.id !== id));
  }

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

  async function sendReminder(lead) {
    setReminderSendingId(lead.id);
    setError("");
    try {
      const result = await apiPost("/api/lead-reminder", { leadId: lead.id });
      if (result?.skipped) {
        setError("E-Mail-Versand ist auf dem Server nicht konfiguriert (RESEND_API_KEY fehlt) — es wurde nichts verschickt.");
        return;
      }
      setReminderSentId(lead.id);
      setTimeout(() => setReminderSentId((cur) => (cur === lead.id ? null : cur)), 3000);
    } catch (e) {
      setError(e.message);
    } finally {
      setReminderSendingId(null);
    }
  }

  function isValidEmail(v) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
  }

  function startEditEmail(lead) {
    setEditingEmailId(lead.id);
    setEmailDraft(lead.email || "");
    setError("");
  }

  async function saveEmail(lead) {
    const value = emailDraft.trim();
    if (value && !isValidEmail(value)) {
      setError("Bitte eine gültige E-Mail-Adresse eingeben (z.B. name@beispiel.de).");
      return;
    }
    const { error: err } = await supabase.from("leads").update({ email: value || null }).eq("id", lead.id);
    if (err) { setError(err.message); return; }
    setLeads((prev) => prev.map((l) => (l.id === lead.id ? { ...l, email: value || null } : l)));
    setEditingEmailId(null);
  }

  async function clearEmail(lead) {
    const { error: err } = await supabase.from("leads").update({ email: null }).eq("id", lead.id);
    if (err) { setError(err.message); return; }
    setLeads((prev) => prev.map((l) => (l.id === lead.id ? { ...l, email: null } : l)));
    setEditingEmailId(null);
  }

  function formatAppointment(iso) {
    if (!iso) return "Kein Termin-Zeitpunkt";
    const d = new Date(iso);
    return d.toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" }) + " · " + d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  }

  if (loading) return <Layout><p className="text-textMuted text-sm">Lädt...</p></Layout>;

  return (
    <Layout>
      <h1 className="text-2xl font-display font-medium brand-text-gradient mb-1">Termine</h1>
      <div className="brand-stripe w-16 mb-4" />
      <p className="text-textMuted text-sm mb-5">Beim Call Tracker erfasste Kundendaten und Termine.</p>

      {canSeeTeam && (
        <div className="flex items-center gap-2 mb-5 flex-wrap">
          {[["own", "Meine"], ["team", "Alle im Team"]].map(([key, label]) => (
            <button key={key} onClick={() => setViewMode(key)} className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${viewMode === key ? "bg-amber text-[var(--org-button-text,#fff)] border-amber" : "border-line text-textMuted hover:text-textMain"}`}>
              {label}
            </button>
          ))}
          <button onClick={() => setShowEmailManager((v) => !v)} className="btn-ghost text-xs ml-auto">
            <Icon name="send" size={12} /> Benachrichtigungen
          </button>
        </div>
      )}

      {showEmailManager && (
        <div className="card mb-5">
          <div className="font-semibold text-textMain text-sm mb-1">E-Mail-Benachrichtigungen bei neuen Terminen</div>
          <p className="text-xs text-textMuted mb-3">
            Manager, Admins und Team-Leads eurer Organisation bekommen automatisch eine E-Mail. Zusätzliche Adressen
            (z.B. ein gemeinsames Postfach) könnt ihr hier eintragen.
          </p>
          <div className="flex flex-col gap-2 mb-3">
            {notificationEmails.map((e) => (
              <div key={e.id} className="flex items-center gap-2 text-sm">
                <span className="text-textMain flex-1">{e.email}</span>
                <button onClick={() => removeNotificationEmail(e.id)} className="btn-ghost text-xs text-coral">Entfernen</button>
              </div>
            ))}
            {notificationEmails.length === 0 && <p className="text-textMuted text-xs">Noch keine zusätzlichen Adressen eingetragen.</p>}
          </div>
          <div className="flex items-center gap-2">
            <input
              className="input flex-1"
              type="email"
              placeholder="zusaetzliche@adresse.de"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addNotificationEmail()}
            />
            <button disabled={savingEmail || !newEmail.trim()} onClick={addNotificationEmail} className="btn text-xs flex-shrink-0 disabled:opacity-40">
              {savingEmail ? "..." : "Hinzufügen"}
            </button>
          </div>
        </div>
      )}

      {error && <div className="card border border-coral/40 text-coral text-sm mb-4">{error}</div>}

      <div className="flex flex-col gap-3">
        {leads.map((lead) => {
          const owner = profileMap[lead.created_by];
          const statusColor = STATUS_COLORS[lead.status];
          const isHighlighted = highlightId === lead.id;
          return (
            <div
              key={lead.id}
              ref={(el) => { leadRefs.current[lead.id] = el; }}
              className={`card transition ${isHighlighted ? "ring-2 ring-amber" : ""}`}
            >
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

              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-textMuted mb-2 items-center">
                {lead.phone && <span>📞 {lead.phone}</span>}
                {editingEmailId === lead.id ? (
                  <span className="flex items-center gap-1.5">
                    ✉️
                    <input
                      type="email"
                      autoFocus
                      className="input !py-1 !px-2 text-xs w-48"
                      value={emailDraft}
                      onChange={(e) => setEmailDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveEmail(lead);
                        if (e.key === "Escape") setEditingEmailId(null);
                      }}
                      placeholder="name@beispiel.de"
                    />
                    <button onClick={() => saveEmail(lead)} className="btn-ghost text-xs !px-1.5">Speichern</button>
                    <button onClick={() => setEditingEmailId(null)} className="btn-ghost text-xs !px-1.5">Abbrechen</button>
                    {lead.email && <button onClick={() => clearEmail(lead)} className="btn-ghost text-xs !px-1.5 text-coral">Löschen</button>}
                  </span>
                ) : (
                  <button onClick={() => startEditEmail(lead)} className="hover:text-textMain flex items-center gap-1">
                    ✉️ {lead.email || <span className="italic">Keine E-Mail — hinzufügen</span>}
                  </button>
                )}
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
                {lead.email && lead.status === "geplant" && (
                  <button
                    disabled={reminderSendingId === lead.id}
                    onClick={() => sendReminder(lead)}
                    className={`btn-ghost text-xs ${lead.recording_path ? "" : "ml-auto"} disabled:opacity-40`}
                  >
                    <Icon name="send" size={12} />{" "}
                    {reminderSendingId === lead.id ? "Sende..." : reminderSentId === lead.id ? "Erinnerung gesendet ✓" : "Erinnerung senden"}
                  </button>
                )}
                {lead.recording_path && (
                  <button onClick={() => togglePlay(lead)} className={`btn-ghost text-xs ${lead.email && lead.status === "geplant" ? "" : "ml-auto"}`}>
                    <Icon name="chat" size={12} /> {playingId === lead.id ? "Aufnahme ausblenden" : "Aufnahme abspielen"}
                  </button>
                )}
              </div>
              {playingId === lead.id && playingUrl && <AudioPlayer src={playingUrl} />}

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

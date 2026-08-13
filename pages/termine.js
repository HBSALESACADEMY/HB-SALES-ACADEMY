import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import Layout from "../components/Layout";
import InfoCard from "../components/InfoCard";
import Icon from "../components/Icon";
import Avatar from "../components/Avatar";
import AudioPlayer from "../components/AudioPlayer";
import { supabase } from "../lib/supabaseClient";
import { apiGet, apiPost } from "../lib/apiClient";
import { openProfile } from "../lib/profileModalBus";
import { getActiveOrgId } from "../lib/activeOrg";
import { taskUrgency, URGENCY_STYLES } from "../lib/taskUrgency";

const STATUS_LABELS = { geplant: "Geplant", wahrgenommen: "Wahrgenommen", abgesagt: "Abgesagt" };
const STATUS_COLORS = { geplant: "amber", wahrgenommen: "teal", abgesagt: "coral" };
const OUTCOME_LABELS = { kunde: "Kunde geworden", follow_up: "Überlegt (Follow-up)", absage: "Absage" };
const OUTCOME_COLORS = { kunde: "teal", follow_up: "violet", absage: "coral" };

export default function Termine() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [canSeeTeam, setCanSeeTeam] = useState(false);
  const [canDeleteTeam, setCanDeleteTeam] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
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
  const [editingLeadId, setEditingLeadId] = useState(null);
  const [editDraft, setEditDraft] = useState(null);
  const [orgMembers, setOrgMembers] = useState([]);
  const [commentsByLead, setCommentsByLead] = useState({});
  const [tasksByLead, setTasksByLead] = useState({});
  const [commentDrafts, setCommentDrafts] = useState({});
  const [commentSending, setCommentSending] = useState(null);
  const [showCommentsFor, setShowCommentsFor] = useState(null);
  // Mention-Autocomplete in Kommentaren: leadId der aktiven Eingabe.
  const [commentMentionTarget, setCommentMentionTarget] = useState(null);
  const [commentMentionQuery, setCommentMentionQuery] = useState("");
  const [commentMentionStart, setCommentMentionStart] = useState(-1);
  const commentInputRefs = useRef({});
  const [showTaskFormFor, setShowTaskFormFor] = useState(null);
  const [taskDraft, setTaskDraft] = useState({ assignedTo: "", title: "", dueDate: "" });
  const [taskSaving, setTaskSaving] = useState(false);
  const [expandedLeadId, setExpandedLeadId] = useState(null);
  const [leadSearchQuery, setLeadSearchQuery] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [addDraft, setAddDraft] = useState({ name: "", phone: "", email: "", company: "", website: "", appointmentAt: "", isDecisionMaker: false, notes: "" });
  const [addSaving, setAddSaving] = useState(false);
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
    // Deckt sich mit der leads_delete-RLS-Policy: backend-Rolle darf zwar
    // verwalten/sehen, aber keine fremden Termine löschen.
    setCanDeleteTeam(!!(me?.role === "manager" || me?.is_admin || me?.is_platform_admin));
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

    const activeOrgId = getActiveOrgId(me);
    if (canManage && activeOrgId) {
      const { data: emails } = await supabase.from("notification_emails").select("*").eq("organization_id", activeOrgId).order("created_at");
      setNotificationEmails(emails || []);
    }
    // Für @Erwähnungen in Kommentaren und die Aufgaben-Zuweisung — alle
    // Mitglieder der aktiven Organisation, unabhängig von der Rolle. Zusätzlich
    // immer sich selbst mit einschließen: Plattform-Admins, die per Firmencode
    // "als" eine andere Organisation unterwegs sind, haben eine abweichende
    // Heimat-Organisation und würden sonst aus der eigenen Liste fallen.
    if (activeOrgId) {
      const { data: members } = await supabase.from("profiles").select("id, full_name, avatar_url")
        .eq("status", "approved")
        .or(`organization_id.eq.${activeOrgId},id.eq.${session.user.id}`);
      setOrgMembers(members || []);
    }

    const leadIds = (leadRows || []).map((l) => l.id);
    if (leadIds.length) {
      const [{ data: comments }, { data: tasks }] = await Promise.all([
        supabase.from("lead_comments").select("*").in("lead_id", leadIds).order("created_at", { ascending: true }),
        supabase.from("lead_tasks").select("*").in("lead_id", leadIds).order("created_at", { ascending: true }),
      ]);
      const cByLead = {};
      (comments || []).forEach((c) => { cByLead[c.lead_id] = cByLead[c.lead_id] || []; cByLead[c.lead_id].push(c); });
      setCommentsByLead(cByLead);
      const tByLead = {};
      (tasks || []).forEach((t) => { tByLead[t.lead_id] = tByLead[t.lead_id] || []; tByLead[t.lead_id].push(t); });
      setTasksByLead(tByLead);
      // profileMap wird auch für Kommentar-/Aufgaben-Autoren gebraucht, nicht
      // nur für Termin-Ersteller:innen in der Team-Ansicht.
      const authorIds = [...new Set([
        ...(comments || []).map((c) => c.user_id),
        ...(tasks || []).flatMap((t) => [t.assigned_to, t.assigned_by]),
      ])].filter((id) => !profileMap[id]);
      if (authorIds.length) {
        const { data: authorProfiles } = await supabase.from("profiles").select("id, full_name, avatar_url").in("id", authorIds);
        if (authorProfiles?.length) {
          setProfileMap((prev) => {
            const next = { ...prev };
            authorProfiles.forEach((p) => { next[p.id] = p; });
            return next;
          });
        }
      }
    } else {
      setCommentsByLead({});
      setTasksByLead({});
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

  // Deep-Link aus der Termin-Benachrichtigungsmail (?leadId=...): Kachel
  // aufklappen, zum passenden Termin scrollen und ihn kurz hervorheben.
  useEffect(() => {
    const leadId = router.query.leadId;
    if (!leadId || !leads.length) return;
    setExpandedLeadId(leadId);
    // Kurz warten, bis die aufgeklappte Karte im DOM steht, bevor gescrollt wird.
    const t1 = setTimeout(() => {
      const el = leadRefs.current[leadId];
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        setHighlightId(leadId);
        setTimeout(() => setHighlightId(null), 4000);
      }
    }, 50);
    return () => clearTimeout(t1);
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

  async function deleteTermin(lead) {
    setDeleting(true);
    const { error: err } = await supabase.from("leads").delete().eq("id", lead.id);
    if (err) { setError(err.message); setDeleting(false); return; }
    // Sonst bliebe die Aufnahme im Speicher liegen, nur der Datenbank-Eintrag
    // würde verschwinden (DSGVO: Löschung muss auch die Datei selbst treffen).
    if (lead.recording_path) {
      await supabase.storage.from("lead-recordings").remove([lead.recording_path]);
    }
    setLeads((prev) => prev.filter((l) => l.id !== lead.id));
    setConfirmDelete(null);
    setDeleting(false);
  }

  async function submitNewLead() {
    if (!addDraft.name.trim() || !addDraft.phone.trim() || !addDraft.email.trim() || !addDraft.appointmentAt) {
      setError("Bitte Name, Telefon, E-Mail und Termin-Zeitpunkt ausfüllen.");
      return;
    }
    setAddSaving(true);
    setError("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const { data: me } = await supabase.from("profiles").select("organization_id, is_platform_admin").eq("id", session.user.id).maybeSingle();
      const activeOrgId = getActiveOrgId(me);
      // Läuft über dieselbe Route wie der Call Tracker (pages/api/lead-created.js)
      // — dadurch auch dieselbe automatische Team-Benachrichtigung.
      const { leadId } = await apiPost("/api/lead-created", {
        name: addDraft.name.trim(),
        phone: addDraft.phone.trim(),
        email: addDraft.email.trim(),
        company: addDraft.company.trim() || null,
        website: addDraft.website.trim() || null,
        isDecisionMaker: addDraft.isDecisionMaker,
        notes: addDraft.notes.trim() || null,
        recordingPath: null,
        appointmentAt: new Date(addDraft.appointmentAt).toISOString(),
        activeOrgId,
      });
      setAddDraft({ name: "", phone: "", email: "", company: "", website: "", appointmentAt: "", isDecisionMaker: false, notes: "" });
      setShowAddForm(false);
      await load(true);
      setExpandedLeadId(leadId);
    } catch (e) {
      setError(e.message);
    } finally {
      setAddSaving(false);
    }
  }

  // profileMap wird erst beim nächsten Neuladen (alle 20s) um gerade erst
  // zugewiesene/erwähnte Personen ergänzt — orgMembers ist schon vollständig
  // und lokal sofort verfügbar, deshalb als Fallback statt "Unbenannt".
  function nameFor(id) {
    return profileMap[id]?.full_name || orgMembers.find((m) => m.id === id)?.full_name || (id === selfId ? "Ich" : "Unbenannt");
  }

  function toLocalDatetimeValue(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  }

  function startEditLead(lead) {
    setEditingLeadId(lead.id);
    setEditDraft({
      name: lead.name || "",
      phone: lead.phone || "",
      company: lead.company || "",
      website: lead.website || "",
      notes: lead.notes || "",
      is_decision_maker: !!lead.is_decision_maker,
      appointment_at: toLocalDatetimeValue(lead.appointment_at),
    });
    setError("");
  }

  async function saveEditLead(id) {
    if (!editDraft.name.trim()) { setError("Name darf nicht leer sein."); return; }
    const patch = {
      name: editDraft.name.trim(),
      phone: editDraft.phone.trim() || null,
      company: editDraft.company.trim() || null,
      website: editDraft.website.trim() || null,
      notes: editDraft.notes.trim() || null,
      is_decision_maker: editDraft.is_decision_maker,
      appointment_at: editDraft.appointment_at ? new Date(editDraft.appointment_at).toISOString() : null,
    };
    const { error: err } = await supabase.from("leads").update(patch).eq("id", id);
    if (err) { setError(err.message); return; }
    setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
    setEditingLeadId(null);
    setEditDraft(null);
  }

  function detectMention(text, caret) {
    const upto = text.slice(0, caret);
    const at = upto.lastIndexOf("@");
    if (at === -1) return null;
    const between = upto.slice(at + 1);
    if (/\s/.test(between)) return null;
    return { start: at, query: between };
  }

  function handleCommentMentionChange(leadId, text, caret) {
    const m = detectMention(text, caret);
    if (m) {
      setCommentMentionTarget(leadId);
      setCommentMentionStart(m.start);
      setCommentMentionQuery(m.query);
    } else if (commentMentionTarget === leadId) {
      setCommentMentionTarget(null);
    }
  }

  const commentMentionResults = commentMentionTarget == null ? [] : orgMembers
    .filter((p) => p.id !== selfId && (!commentMentionQuery || (p.full_name || "").toLowerCase().includes(commentMentionQuery.toLowerCase())))
    .slice(0, 6);

  function selectCommentMention(profile) {
    const name = profile.full_name || "Unbenannt";
    const leadId = commentMentionTarget;
    const current = commentDrafts[leadId] || "";
    const next = current.slice(0, commentMentionStart) + `@${name} ` + current.slice(commentMentionStart + 1 + commentMentionQuery.length);
    setCommentDrafts((prev) => ({ ...prev, [leadId]: next }));
    setCommentMentionTarget(null);
    setCommentMentionQuery("");
    setCommentMentionStart(-1);
    requestAnimationFrame(() => commentInputRefs.current[leadId]?.focus());
  }

  function extractMentionedIds(text) {
    const names = orgMembers.map((p) => ({ id: p.id, name: p.full_name })).filter((p) => p.name).sort((a, b) => b.name.length - a.name.length);
    if (!text || !names.length) return [];
    const pattern = new RegExp("@(" + names.map((n) => n.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|") + ")(?!\\S)", "g");
    const ids = new Set();
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const found = names.find((n) => n.name === match[1]);
      if (found && found.id !== selfId) ids.add(found.id);
    }
    return [...ids];
  }

  function renderCommentContent(text) {
    const names = orgMembers.map((p) => ({ id: p.id, name: p.full_name })).filter((p) => p.name).sort((a, b) => b.name.length - a.name.length);
    if (!text || !names.length) return text;
    const pattern = new RegExp("@(" + names.map((n) => n.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|") + ")(?!\\S)", "g");
    const parts = [];
    let lastIndex = 0;
    let match;
    while ((match = pattern.exec(text)) !== null) {
      if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
      const found = names.find((n) => n.name === match[1]);
      parts.push(
        <span key={match.index} className="text-amber font-semibold cursor-pointer hover:underline" onClick={() => openProfile(found.id)}>
          @{match[1]}
        </span>
      );
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < text.length) parts.push(text.slice(lastIndex));
    return parts;
  }

  async function submitComment(leadId) {
    const text = commentDrafts[leadId];
    if (!text?.trim()) return;
    setCommentSending(leadId);
    setError("");
    try {
      const mentionedIds = extractMentionedIds(text);
      const { comment } = await apiPost("/api/lead-comment", { leadId, content: text.trim(), mentionedIds });
      setCommentsByLead((prev) => ({ ...prev, [leadId]: [...(prev[leadId] || []), comment] }));
      setCommentDrafts((prev) => ({ ...prev, [leadId]: "" }));
    } catch (e) {
      setError(e.message);
    } finally {
      setCommentSending(null);
    }
  }

  async function submitTask(leadId) {
    if (!taskDraft.assignedTo || !taskDraft.title.trim()) return;
    setTaskSaving(true);
    setError("");
    try {
      const { task } = await apiPost("/api/lead-task", { leadId, assignedTo: taskDraft.assignedTo, title: taskDraft.title.trim(), dueDate: taskDraft.dueDate || null });
      setTasksByLead((prev) => ({ ...prev, [leadId]: [...(prev[leadId] || []), task] }));
      setTaskDraft({ assignedTo: "", title: "", dueDate: "" });
      setShowTaskFormFor(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setTaskSaving(false);
    }
  }

  async function toggleTaskDone(task) {
    const { error: err } = await supabase.from("lead_tasks").update({ done: !task.done }).eq("id", task.id);
    if (err) { setError(err.message); return; }
    setTasksByLead((prev) => ({
      ...prev,
      [task.lead_id]: (prev[task.lead_id] || []).map((t) => (t.id === task.id ? { ...t, done: !task.done } : t)),
    }));
  }

  async function deleteTask(task) {
    const { error: err } = await supabase.from("lead_tasks").delete().eq("id", task.id);
    if (err) { setError(err.message); return; }
    setTasksByLead((prev) => ({
      ...prev,
      [task.lead_id]: (prev[task.lead_id] || []).filter((t) => t.id !== task.id),
    }));
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
      const { data: { session } } = await supabase.auth.getSession();
      const { data: me } = await supabase.from("profiles").select("organization_id, is_platform_admin").eq("id", session.user.id).maybeSingle();
      const activeOrgId = getActiveOrgId(me);
      const result = await apiPost("/api/lead-reminder", { leadId: lead.id, activeOrgId });
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

  const filteredLeads = leads.filter((lead) => {
    const q = leadSearchQuery.trim().toLowerCase();
    const matchesQuery = !q || [lead.name, lead.company, lead.phone, lead.email].some((f) => (f || "").toLowerCase().includes(q));
    const matchesDate = !dateFilter || (lead.appointment_at && lead.appointment_at.slice(0, 10) === dateFilter);
    return matchesQuery && matchesDate;
  });

  return (
    <Layout>
      <h1 className="text-2xl font-display font-medium brand-text-gradient mb-1">Termine</h1>
      <div className="brand-stripe w-16 mb-4" />
      <p className="text-textMuted text-sm mb-5">Beim Call Tracker erfasste Kundendaten und Termine.</p>

      <InfoCard>
        <strong>Team erinnern</strong> schickt eine Erinnerungsmail an Manager/Admins eurer Organisation und die unter "Benachrichtigungen" eingetragenen Adressen — <strong>nicht</strong> an die Kund:in.
        Die E-Mail-Adresse bei einem Termin lässt sich direkt anklicken, um sie zu bearbeiten oder zu löschen.
        Unter <strong>Kommentare</strong> könnt ihr euch intern zu einem Termin austauschen, mit <strong>@Name</strong> jemanden erwähnen (bekommt eine Mail).
        Unter <strong>Aufgaben</strong> lässt sich jemandem aus eurer Organisation eine Aufgabe zu einem Termin zuweisen.
        Termine können bei Bedarf komplett gelöscht werden (inkl. zugehöriger Aufnahme).
      </InfoCard>

      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <button onClick={() => setShowAddForm((v) => !v)} className="btn text-xs">
          {showAddForm ? "Abbrechen" : "+ Termin hinzufügen"}
        </button>
      </div>

      {showAddForm && (
        <div className="card mb-5">
          <div className="font-semibold text-textMain text-sm mb-3">Neuen Termin anlegen</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
            <input className="input !py-1.5 text-xs" placeholder="Name *" value={addDraft.name} onChange={(e) => setAddDraft((d) => ({ ...d, name: e.target.value }))} />
            <input className="input !py-1.5 text-xs" placeholder="Telefon *" value={addDraft.phone} onChange={(e) => setAddDraft((d) => ({ ...d, phone: e.target.value }))} />
            <input className="input !py-1.5 text-xs" type="email" placeholder="E-Mail *" value={addDraft.email} onChange={(e) => setAddDraft((d) => ({ ...d, email: e.target.value }))} />
            <input type="datetime-local" className="input !py-1.5 text-xs" value={addDraft.appointmentAt} onChange={(e) => setAddDraft((d) => ({ ...d, appointmentAt: e.target.value }))} />
            <input className="input !py-1.5 text-xs" placeholder="Unternehmen" value={addDraft.company} onChange={(e) => setAddDraft((d) => ({ ...d, company: e.target.value }))} />
            <input className="input !py-1.5 text-xs" placeholder="Webseite" value={addDraft.website} onChange={(e) => setAddDraft((d) => ({ ...d, website: e.target.value }))} />
            <label className="flex items-center gap-1.5 text-xs text-textMuted">
              <input type="checkbox" checked={addDraft.isDecisionMaker} onChange={(e) => setAddDraft((d) => ({ ...d, isDecisionMaker: e.target.checked }))} /> Entscheider:in
            </label>
          </div>
          <textarea className="input !py-1.5 text-xs mb-3" rows={2} placeholder="Notizen" value={addDraft.notes} onChange={(e) => setAddDraft((d) => ({ ...d, notes: e.target.value }))} />
          <button disabled={addSaving} onClick={submitNewLead} className="btn text-xs disabled:opacity-40">{addSaving ? "Speichert..." : "Termin speichern"}</button>
        </div>
      )}

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

      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <div className="card flex items-center gap-2 !py-2 flex-1 min-w-[200px]">
          <Icon name="search" size={14} />
          <input
            className="bg-transparent border-none outline-none text-sm flex-1 text-textMain"
            placeholder="Nach Name, Firma, Telefon oder E-Mail suchen..."
            value={leadSearchQuery}
            onChange={(e) => setLeadSearchQuery(e.target.value)}
          />
        </div>
        <input type="date" className="input !w-auto !py-2 text-sm" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} />
        {(leadSearchQuery || dateFilter) && (
          <button onClick={() => { setLeadSearchQuery(""); setDateFilter(""); }} className="btn-ghost text-xs">Filter zurücksetzen</button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {filteredLeads.map((lead) => {
          const owner = profileMap[lead.created_by];
          const statusColor = STATUS_COLORS[lead.status];
          const isHighlighted = highlightId === lead.id;
          const isExpanded = expandedLeadId === lead.id;
          const leadComments = commentsByLead[lead.id] || [];
          const leadTasks = tasksByLead[lead.id] || [];
          const openTaskCount = leadTasks.filter((t) => !t.done).length;

          if (!isExpanded) {
            return (
              <button
                key={lead.id}
                ref={(el) => { leadRefs.current[lead.id] = el; }}
                onClick={() => setExpandedLeadId(lead.id)}
                className={`card text-left flex flex-col gap-1.5 hover:-translate-y-0.5 transition ${isHighlighted ? "ring-2 ring-amber" : ""}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-display font-semibold text-textMain text-sm truncate">{lead.name}</span>
                  <span className={`text-[9px] uppercase tracking-wide text-${statusColor} border border-${statusColor}/40 rounded px-1.5 py-0.5 flex-shrink-0`}>{STATUS_LABELS[lead.status]}</span>
                </div>
                <div className="text-xs text-textMuted truncate">{lead.company || "Kein Unternehmen angegeben"}</div>
                <div className="text-xs font-mono text-textMain">{formatAppointment(lead.appointment_at)}</div>
                {viewMode === "team" && owner && (
                  <div className="flex items-center gap-1.5 text-xs text-textMuted mt-0.5">
                    <Avatar name={owner.full_name || "?"} src={owner.avatar_url} size={16} /> {owner.full_name || "Unbenannt"}
                  </div>
                )}
                {(openTaskCount > 0 || leadComments.length > 0) && (
                  <div className="flex items-center gap-2 text-[10px] text-textMuted mt-1 pt-1.5 border-t border-line">
                    {openTaskCount > 0 && <span>✅ {openTaskCount} offen</span>}
                    {leadComments.length > 0 && <span>💬 {leadComments.length}</span>}
                  </div>
                )}
              </button>
            );
          }

          return (
            <div
              key={lead.id}
              ref={(el) => { leadRefs.current[lead.id] = el; }}
              className={`card transition sm:col-span-2 lg:col-span-3 ${isHighlighted ? "ring-2 ring-amber" : ""}`}
            >
              <button onClick={() => setExpandedLeadId(null)} className="btn-ghost text-xs mb-2">← Zur Übersicht</button>
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
                {lead.website && (
                  <a
                    href={/^https?:\/\//i.test(lead.website) ? lead.website : `https://${lead.website}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-textMain hover:underline"
                  >
                    🌐 {lead.website}
                  </a>
                )}
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
                {lead.status === "geplant" && (
                  <button
                    disabled={reminderSendingId === lead.id}
                    title="Schickt eine Erinnerungsmail an Manager/Admins und die eingetragenen Benachrichtigungs-Adressen, nicht an die Kund:in."
                    onClick={() => sendReminder(lead)}
                    className={`btn-ghost text-xs ${lead.recording_path ? "" : "ml-auto"} disabled:opacity-40`}
                  >
                    <Icon name="send" size={12} />{" "}
                    {reminderSendingId === lead.id ? "Sende..." : reminderSentId === lead.id ? "Team erinnert ✓" : "Team erinnern"}
                  </button>
                )}
                {lead.recording_path && (
                  <button onClick={() => togglePlay(lead)} className={`btn-ghost text-xs ${lead.status === "geplant" ? "" : "ml-auto"}`}>
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

              {(() => {
                const comments = commentsByLead[lead.id] || [];
                const tasks = tasksByLead[lead.id] || [];
                const openTasksCount = tasks.filter((t) => !t.done).length;
                return (
                  <div className="pt-2 mt-2 border-t border-line">
                    {tasks.length > 0 && (
                      <div className="flex flex-col gap-2 mb-3">
                        <span className="text-[10px] text-textMuted font-semibold uppercase tracking-wide">Aufgaben</span>
                        {tasks.map((t) => {
                          const urgency = taskUrgency(t.due_date, t.done);
                          const style = urgency ? URGENCY_STYLES[urgency.level] : null;
                          return (
                            <div key={t.id} className={`flex items-start gap-2.5 text-xs rounded-lg border-2 px-3 py-2.5 ${t.done ? "border-line opacity-60" : style ? `${style.border} ${style.bg}` : "border-line"}`}>
                              <input type="checkbox" checked={t.done} onChange={() => toggleTaskDone(t)} className="mt-0.5 flex-shrink-0 w-4 h-4" />
                              <div className="flex-1 min-w-0">
                                <div className={`font-semibold text-sm ${t.done ? "line-through text-textMuted" : "text-textMain"}`}>{t.title}</div>
                                <div className="text-[11px] text-textMuted flex items-center gap-x-3 gap-y-0.5 flex-wrap mt-1">
                                  <span>👤 Zugewiesen an: <strong className="text-textMain font-normal">{nameFor(t.assigned_to)}</strong></span>
                                  <span>von {nameFor(t.assigned_by)}</span>
                                  {t.due_date && (
                                    <span>🕐 {new Date(t.due_date).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                                  )}
                                </div>
                              </div>
                              {urgency && (
                                <span className={`text-xs font-bold flex-shrink-0 px-2 py-1 rounded-full ${style.text} ${style.bg || "bg-white/5"}`}>{urgency.countdown}</span>
                              )}
                              <button onClick={() => deleteTask(t)} className="btn-ghost !px-1.5 text-[10px] text-coral flex-shrink-0">×</button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    <div className="flex items-center gap-3 flex-wrap">
                      <button onClick={() => setShowCommentsFor((cur) => (cur === lead.id ? null : lead.id))} className="btn-ghost text-xs">
                        <Icon name="chat" size={12} /> Kommentare{comments.length > 0 ? ` (${comments.length})` : ""}
                      </button>
                      <button onClick={() => setShowTaskFormFor((cur) => (cur === lead.id ? null : lead.id))} className="btn-ghost text-xs">
                        + Aufgabe zuweisen{openTasksCount > 0 ? ` (${openTasksCount} offen)` : ""}
                      </button>
                    </div>

                    {showCommentsFor === lead.id && (
                      <div className="mt-2 flex flex-col gap-2">
                        {comments.map((c) => (
                          <div key={c.id} className="text-xs">
                            <span className="font-semibold text-textMain cursor-pointer hover:underline" onClick={() => openProfile(c.user_id)}>
                              {nameFor(c.user_id)}:
                            </span>{" "}
                            <span className="text-textMuted">{renderCommentContent(c.content)}</span>
                          </div>
                        ))}
                        {comments.length === 0 && <p className="text-textMuted text-xs">Noch keine Kommentare.</p>}
                        <div className="relative flex items-center gap-2">
                          <input
                            ref={(el) => { commentInputRefs.current[lead.id] = el; }}
                            className="input flex-1 text-xs"
                            placeholder="Kommentieren... (@ um jemanden zu erwähnen)"
                            value={commentDrafts[lead.id] || ""}
                            onChange={(e) => { setCommentDrafts((prev) => ({ ...prev, [lead.id]: e.target.value })); handleCommentMentionChange(lead.id, e.target.value, e.target.selectionStart); }}
                            onKeyUp={(e) => e.key !== "Enter" && handleCommentMentionChange(lead.id, e.target.value, e.target.selectionStart)}
                            onKeyDown={(e) => e.key === "Enter" && submitComment(lead.id)}
                            onBlur={() => setTimeout(() => setCommentMentionTarget((t) => (t === lead.id ? null : t)), 150)}
                          />
                          <button disabled={commentSending === lead.id} onClick={() => submitComment(lead.id)} className="btn-ghost text-xs disabled:opacity-40">Senden</button>
                          {commentMentionTarget === lead.id && commentMentionResults.length > 0 && (
                            <div className="absolute z-10 bottom-full mb-1 left-0 w-64 max-h-48 overflow-y-auto rounded-lg border border-line bg-[var(--card-bg,#1a1d29)] shadow-lg">
                              {commentMentionResults.map((p) => (
                                <button key={p.id} onMouseDown={(e) => { e.preventDefault(); selectCommentMention(p); }} className="flex items-center gap-2 w-full text-left px-3 py-2 text-xs hover:bg-white/5">
                                  <Avatar name={p.full_name || "?"} src={p.avatar_url} size={20} /> {p.full_name || "Unbenannt"}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {showTaskFormFor === lead.id && (
                      <div className="mt-2 flex flex-col gap-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <select className="input !w-auto !py-1 text-xs" value={taskDraft.assignedTo} onChange={(e) => setTaskDraft((d) => ({ ...d, assignedTo: e.target.value }))}>
                            <option value="">Person wählen...</option>
                            {orgMembers.map((m) => <option key={m.id} value={m.id}>{m.full_name || "Unbenannt"}</option>)}
                          </select>
                          <input className="input !py-1 text-xs flex-1" placeholder="Aufgabe" value={taskDraft.title} onChange={(e) => setTaskDraft((d) => ({ ...d, title: e.target.value }))} />
                          <input type="datetime-local" className="input !py-1 text-xs" value={taskDraft.dueDate} onChange={(e) => setTaskDraft((d) => ({ ...d, dueDate: e.target.value }))} />
                          <button disabled={taskSaving || !taskDraft.assignedTo || !taskDraft.title.trim()} onClick={() => submitTask(lead.id)} className="btn-ghost text-xs disabled:opacity-40">Zuweisen</button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              {editingLeadId === lead.id && (
                <div className="flex flex-col gap-2 mt-2 pt-2 border-t border-line">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input className="input !py-1.5 text-xs" placeholder="Name" value={editDraft.name} onChange={(e) => setEditDraft((d) => ({ ...d, name: e.target.value }))} />
                    <input className="input !py-1.5 text-xs" placeholder="Telefon" value={editDraft.phone} onChange={(e) => setEditDraft((d) => ({ ...d, phone: e.target.value }))} />
                    <input className="input !py-1.5 text-xs" placeholder="Unternehmen" value={editDraft.company} onChange={(e) => setEditDraft((d) => ({ ...d, company: e.target.value }))} />
                    <input className="input !py-1.5 text-xs" placeholder="Webseite" value={editDraft.website} onChange={(e) => setEditDraft((d) => ({ ...d, website: e.target.value }))} />
                    <input type="datetime-local" className="input !py-1.5 text-xs" value={editDraft.appointment_at} onChange={(e) => setEditDraft((d) => ({ ...d, appointment_at: e.target.value }))} />
                    <label className="flex items-center gap-1.5 text-xs text-textMuted">
                      <input type="checkbox" checked={editDraft.is_decision_maker} onChange={(e) => setEditDraft((d) => ({ ...d, is_decision_maker: e.target.checked }))} /> Entscheider:in
                    </label>
                  </div>
                  <textarea className="input !py-1.5 text-xs" rows={2} placeholder="Notizen" value={editDraft.notes} onChange={(e) => setEditDraft((d) => ({ ...d, notes: e.target.value }))} />
                  <div className="flex items-center gap-2">
                    <button onClick={() => saveEditLead(lead.id)} className="btn-ghost text-xs">Speichern</button>
                    <button onClick={() => { setEditingLeadId(null); setEditDraft(null); }} className="btn-ghost text-xs">Abbrechen</button>
                  </div>
                </div>
              )}
              {(lead.created_by === selfId || canSeeTeam) && (
                <div className="flex items-center justify-end gap-2 pt-2 mt-2 border-t border-line">
                  {editingLeadId !== lead.id && (
                    <button onClick={() => startEditLead(lead)} className="btn-ghost text-xs">Bearbeiten</button>
                  )}
                  {(lead.created_by === selfId || canDeleteTeam) && (
                    confirmDelete === lead.id ? (
                      <span className="flex items-center gap-1.5">
                        <span className="text-xs text-coral">Termin wirklich löschen?</span>
                        <button disabled={deleting} onClick={() => deleteTermin(lead)} className="btn-ghost text-xs text-coral border-coral/40 disabled:opacity-40">Ja, löschen</button>
                        <button disabled={deleting} onClick={() => setConfirmDelete(null)} className="btn-ghost text-xs">Abbrechen</button>
                      </span>
                    ) : (
                      <button onClick={() => setConfirmDelete(lead.id)} className="btn-ghost text-xs text-coral">Löschen</button>
                    )
                  )}
                </div>
              )}
            </div>
          );
        })}
        {filteredLeads.length === 0 && leads.length > 0 && <p className="text-textMuted text-sm">Keine Termine gefunden.</p>}
        {leads.length === 0 && <p className="text-textMuted text-sm">Noch keine Termine erfasst — beim "Terminiert"-Klick im Call Tracker landen sie hier.</p>}
      </div>
    </Layout>
  );
}

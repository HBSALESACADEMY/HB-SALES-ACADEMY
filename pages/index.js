import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Layout, { patchCachedProfile } from "../components/Layout";
import Icon from "../components/Icon";
import Avatar from "../components/Avatar";
import { supabase } from "../lib/supabaseClient";
import { getUnreadMessageInfo } from "../lib/unreadMessages";
import { COURSES } from "../lib/curriculum";
import { taskUrgency, URGENCY_STYLES } from "../lib/taskUrgency";

export default function Dashboard() {
  const router = useRouter();
  const [quizResults, setQuizResults] = useState([]);
  const [examResults, setExamResults] = useState([]);
  const [rpSessions, setRpSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [hub, setHub] = useState({ unreadMessages: 0, unreadCommunity: 0, openDuels: 0, dueFlashcards: 0, pendingApprovals: 0, pendingSuggestions: 0, pendingFriendRequests: 0, isManager: false });
  const [draggedTileKey, setDraggedTileKey] = useState(null);
  const [dashboardPrefs, setDashboardPrefs] = useState({});
  const [onboarding, setOnboarding] = useState(null); // null = noch nicht geladen/nicht nötig
  const [adminSnapshot, setAdminSnapshot] = useState(null);
  const [pendingFriendReqs, setPendingFriendReqs] = useState([]);
  const [friendReqBusyId, setFriendReqBusyId] = useState(null);
  const [upcomingLeads, setUpcomingLeads] = useState([]);
  const [teamUpcomingLeads, setTeamUpcomingLeads] = useState([]);
  const [myMentions, setMyMentions] = useState([]);
  const [myOpenTasks, setMyOpenTasks] = useState([]);

  async function loadPendingFriendRequests(uid) {
    const { data: reqs } = await supabase.from("friendships").select("id, requester_id").eq("addressee_id", uid).eq("status", "pending").order("created_at", { ascending: false });
    const requesterIds = (reqs || []).map((r) => r.requester_id);
    const { data: requesterProfiles } = requesterIds.length
      ? await supabase.from("profiles").select("id, full_name, avatar_url").in("id", requesterIds)
      : { data: [] };
    const profileById = new Map((requesterProfiles || []).map((p) => [p.id, p]));
    setPendingFriendReqs((reqs || []).map((r) => ({ ...r, profile: profileById.get(r.requester_id) })));
  }

  async function respondFriendRequest(id, status) {
    setFriendReqBusyId(id);
    const { data: { session } } = await supabase.auth.getSession();
    await supabase.from("friendships").update({ status }).eq("id", id);
    if (session) await loadPendingFriendRequests(session.user.id);
    setFriendReqBusyId(null);
  }

  async function persistTileOrder(newOrder) {
    setDashboardPrefs((prev) => {
      const next = { ...prev, order: newOrder };
      (async () => {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;
        patchCachedProfile({ dashboard_prefs: next });
        await supabase.from("profiles").update({ dashboard_prefs: next }).eq("id", session.user.id);
      })();
      return next;
    });
  }

  function handleTileDrop(targetKey, visibleTiles) {
    if (!draggedTileKey || draggedTileKey === targetKey) { setDraggedTileKey(null); return; }
    const currentKeys = visibleTiles.map((t) => t.key);
    const fromIdx = currentKeys.indexOf(draggedTileKey);
    const toIdx = currentKeys.indexOf(targetKey);
    if (fromIdx === -1 || toIdx === -1) { setDraggedTileKey(null); return; }
    const reordered = [...currentKeys];
    reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, draggedTileKey);
    setDraggedTileKey(null);
    persistTileOrder(reordered);
  }

  async function dismissOnboarding() {
    setOnboarding(null);
    const { data: { session } } = await supabase.auth.getSession();
    if (session) await supabase.from("profiles").update({ onboarding_dismissed: true }).eq("id", session.user.id);
  }

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const uid = session.user.id;
      const [{ data: qr }, { data: er }, { data: rp }] = await Promise.all([
        supabase.from("quiz_results").select("module_id, mc_score, mc_total").eq("user_id", uid),
        supabase.from("exam_results").select("course_id, passed").eq("user_id", uid),
        supabase.from("roleplay_sessions").select("id").eq("user_id", uid),
      ]);
      setQuizResults(qr || []);
      setExamResults(er || []);
      setRpSessions(rp || []);
      setLoading(false);
      loadPendingFriendRequests(uid);

      const { data: me } = await supabase.from("profiles").select("role, is_admin, is_platform_admin, last_seen_community_at, dashboard_prefs, onboarding_dismissed, full_name, bio, avatar_url").eq("id", uid).maybeSingle();
      const since = me?.last_seen_community_at || new Date(0).toISOString();
      setDashboardPrefs(me?.dashboard_prefs || {});

      const [
        { count: postCount }, { count: commentCount },
        { data: cards }, { data: progress },
        { data: myDuels },
        { count: friendReqCount },
        unreadInfo,
      ] = await Promise.all([
        supabase.from("community_posts").select("id", { count: "exact", head: true }).gt("created_at", since).neq("user_id", uid),
        supabase.from("community_comments").select("id", { count: "exact", head: true }).gt("created_at", since).neq("user_id", uid),
        supabase.from("flashcards").select("id"),
        supabase.from("flashcard_progress").select("card_id, next_review_date").eq("user_id", uid),
        supabase.from("duels").select("*").or(`challenger_id.eq.${uid},opponent_id.eq.${uid}`),
        supabase.from("friendships").select("id", { count: "exact", head: true }).eq("addressee_id", uid).eq("status", "pending"),
        getUnreadMessageInfo(supabase, uid),
      ]);
      const msgCount = unreadInfo.total;

      const today = new Date().toISOString().slice(0, 10);
      const progressByCard = {};
      (progress || []).forEach((p) => { progressByCard[p.card_id] = p; });
      const dueFlashcards = (cards || []).filter((c) => !progressByCard[c.id] || progressByCard[c.id].next_review_date <= today).length;

      const openDuels = (myDuels || []).filter((d) => {
        const isChallenger = d.challenger_id === uid;
        return (isChallenger && d.challenger_score == null) || (!isChallenger && d.opponent_score == null);
      }).length;

      let pendingApprovals = 0, pendingSuggestions = 0;
      if (me?.role === "manager") {
        const [{ count: a }, { count: s }] = await Promise.all([
          supabase.from("profiles").select("id", { count: "exact", head: true }).eq("status", "pending"),
          supabase.from("kb_entries").select("id", { count: "exact", head: true }).eq("status", "pending"),
        ]);
        pendingApprovals = a || 0;
        pendingSuggestions = s || 0;
      }

      setHub({
        unreadMessages: msgCount || 0,
        unreadCommunity: (postCount || 0) + (commentCount || 0),
        openDuels, dueFlashcards,
        pendingApprovals, pendingSuggestions,
        pendingFriendRequests: friendReqCount || 0,
        isManager: me?.role === "manager",
      });

      if (!me?.onboarding_dismissed) {
        const steps = [
          { key: "profile", label: "Profil ausfüllen (Foto/Bio)", done: !!(me?.avatar_url || me?.bio), route: "/profile" },
          { key: "course", label: "Ersten Kurs starten", done: (qr || []).length > 0, route: "/courses" },
          { key: "roleplay", label: "Erstes Rollenspiel üben", done: (rp || []).length > 0, route: "/roleplay" },
        ];
        if (steps.some((s) => !s.done)) setOnboarding(steps);
      }

      if (me?.is_admin) {
        const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
        const { data: myProfile } = await supabase.from("profiles").select("organization_id").eq("id", uid).maybeSingle();
        const orgId = myProfile?.organization_id;
        const [{ count: totalMembers }, { data: logins }, { count: pendingCount }, { data: approvedIdsData }] = await Promise.all([
          supabase.from("profiles").select("id", { count: "exact", head: true }).eq("status", "approved").eq("organization_id", orgId),
          supabase.from("login_events").select("user_id").gt("created_at", weekAgo),
          supabase.from("profiles").select("id", { count: "exact", head: true }).eq("status", "pending").eq("organization_id", orgId),
          supabase.from("profiles").select("id").eq("status", "approved").eq("organization_id", orgId),
        ]);
        // Eindeutige Nutzer zählen (nicht Login-Ereignisse) — sonst kann die
        // Zahl bei mehrfachen Logins über die tatsächliche Mitgliederzahl
        // hinausgehen. Nur gegen aktuell genehmigte Mitglieder der eigenen
        // Organisation zählen.
        const approvedIds = new Set((approvedIdsData || []).map((p) => p.id));
        const weeklyActiveCount = new Set((logins || []).map((l) => l.user_id).filter((id) => approvedIds.has(id))).size;
        setAdminSnapshot({ totalMembers: totalMembers || 0, weeklyActiveCount, pendingCount: pendingCount || 0 });
      }

      // Anstehende Termine — eigene für alle, teamweite zusätzlich für
      // Manager/Admins/Backend (RLS scoped bereits auf die eigene Organisation).
      const nowIso = new Date().toISOString();
      const { data: myLeads } = await supabase.from("leads").select("id, name, company, appointment_at")
        .eq("created_by", uid).eq("status", "geplant").not("appointment_at", "is", null)
        .gte("appointment_at", nowIso).order("appointment_at", { ascending: true }).limit(5);
      setUpcomingLeads(myLeads || []);

      const canManageLeads = me?.role === "manager" || me?.role === "backend" || me?.is_admin || me?.is_platform_admin;
      if (canManageLeads) {
        const { data: teamLeads } = await supabase.from("leads").select("id, name, company, appointment_at, created_by")
          .eq("status", "geplant").not("appointment_at", "is", null)
          .gte("appointment_at", nowIso).order("appointment_at", { ascending: true }).limit(8);
        const creatorIds = [...new Set((teamLeads || []).map((l) => l.created_by))];
        let creatorMap = {};
        if (creatorIds.length) {
          const { data: creators } = await supabase.from("profiles").select("id, full_name").in("id", creatorIds);
          (creators || []).forEach((c) => { creatorMap[c.id] = c.full_name; });
        }
        setTeamUpcomingLeads((teamLeads || []).map((l) => ({ ...l, creatorName: creatorMap[l.created_by] })));
      } else {
        setTeamUpcomingLeads([]);
      }

      // Erwähnungen (Community + Termin-Kommentare) und offene, mir
      // zugewiesene Aufgaben — beides ungelesen bzw. noch nicht erledigt.
      const [{ data: communityMentions }, { data: leadMentions }, { data: openTasks }] = await Promise.all([
        supabase.from("community_notifications").select("*").eq("user_id", uid).eq("read", false).order("created_at", { ascending: false }).limit(10),
        supabase.from("lead_mentions").select("*").eq("user_id", uid).eq("read", false).order("created_at", { ascending: false }).limit(10),
        supabase.from("lead_tasks").select("*").eq("assigned_to", uid).eq("done", false).order("due_date", { ascending: true, nullsFirst: false }).limit(10),
      ]);

      const mentionActorIds = [...new Set([...(communityMentions || []).map((m) => m.actor_id), ...(leadMentions || []).map((m) => m.actor_id)])];
      const leadIdsForMentions = [...new Set((leadMentions || []).map((m) => m.lead_id))];
      const leadIdsForTasks = [...new Set((openTasks || []).map((t) => t.lead_id))];
      const taskAssignerIds = [...new Set((openTasks || []).map((t) => t.assigned_by))];
      const allNameIds = [...new Set([...mentionActorIds, ...taskAssignerIds])];
      const allLeadIds = [...new Set([...leadIdsForMentions, ...leadIdsForTasks])];

      const [{ data: nameProfiles }, { data: mentionLeads }] = await Promise.all([
        allNameIds.length ? supabase.from("profiles").select("id, full_name").in("id", allNameIds) : Promise.resolve({ data: [] }),
        allLeadIds.length ? supabase.from("leads").select("id, name").in("id", allLeadIds) : Promise.resolve({ data: [] }),
      ]);
      const nameById = {};
      (nameProfiles || []).forEach((p) => { nameById[p.id] = p.full_name; });
      const leadNameById = {};
      (mentionLeads || []).forEach((l) => { leadNameById[l.id] = l.name; });

      const mentions = [
        ...(communityMentions || []).map((m) => ({
          id: `c:${m.id}`, actorName: nameById[m.actor_id] || "Jemand",
          label: m.type === "mention_comment" ? "in einem Community-Kommentar" : "in einem Community-Beitrag",
          route: `/community?postId=${m.post_id}`,
        })),
        ...(leadMentions || []).map((m) => ({
          id: `l:${m.id}`, actorName: nameById[m.actor_id] || "Jemand",
          label: `beim Termin mit ${leadNameById[m.lead_id] || "Unbenannt"}`,
          route: `/termine?leadId=${m.lead_id}`,
        })),
      ];
      setMyMentions(mentions);

      setMyOpenTasks((openTasks || []).map((t) => ({
        ...t, leadName: leadNameById[t.lead_id] || "Unbenannt", assignedByName: nameById[t.assigned_by] || "Jemand",
      })));
    }
    load();

    // Echtzeit: neue Nachrichten/Community-Aktivität/Registrierungen aktualisieren
    // die Kacheln sofort, auch wenn man schon auf dem Dashboard ist. "profiles"
    // fehlte hier bisher — neue, auf Freigabe wartende Registrierungen wurden
    // dadurch nicht live erkannt (nur beim erneuten Laden der Seite).
    const channel = supabase
      .channel("dashboard-realtime")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "direct_messages" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "conversation_reads" }, load)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "community_posts" }, load)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "community_comments" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "friendships" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "leads" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "lead_tasks" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "lead_mentions" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "community_notifications" }, load)
      .subscribe();
    // Polling-Fallback (wie im Sidebar-Badge/in der Nutzerverwaltung): falls die
    // Realtime-Verbindung mal stumm abbricht, ist das Dashboard trotzdem
    // spätestens nach 20 Sekunden wieder aktuell.
    const interval = setInterval(load, 20000);
    return () => { supabase.removeChannel(channel); clearInterval(interval); };
  }, []);

  const totalModules = COURSES.reduce((s, c) => s + c.modules.length, 0);
  const doneModuleIds = new Set(quizResults.map((r) => r.module_id));
  const certCount = examResults.filter((r) => r.passed).length;
  const avgMc = quizResults.length ? Math.round(quizResults.reduce((s, r) => s + (r.mc_total ? r.mc_score / r.mc_total : 0), 0) / quizResults.length * 100) : null;
  const nextCourse = COURSES.find((c) => !examResults.some((r) => r.course_id === c.id && r.passed));

  return (
    <Layout>
      {(profile) => (
        <>
          <h1 className="text-2xl font-display font-medium brand-text-gradient mb-1">Willkommen zurück{profile?.full_name ? `, ${profile.full_name}` : ""}</h1>
          <div className="brand-stripe w-16 mb-4" />
          <p className="text-textMuted text-sm mb-6">Dein Überblick über Fortschritt und nächste Schritte.</p>

          {profile?.streak_count > 0 && profile?.last_challenge_date !== new Date().toISOString().slice(0, 10) && (
            <div className="card mb-5 border border-amber/30 flex items-center gap-3 cursor-pointer" onClick={() => router.push("/daily-challenge")}>
              <Icon name="flame" color="var(--org-accent, #CE3A5C)" size={18} />
              <span className="text-sm text-textMain flex-1">Deine {profile.streak_count}-Tage-Serie ist in Gefahr — heute noch die Tages-Challenge machen!</span>
            </div>
          )}

          {onboarding && (
            <div className="card mb-5">
              <div className="flex items-center justify-between mb-2.5">
                <span className="font-semibold text-textMain text-sm">👋 Erste Schritte</span>
                <button onClick={dismissOnboarding} className="text-textMuted hover:text-textMain text-xs">Ausblenden</button>
              </div>
              <div className="flex flex-col gap-1.5">
                {onboarding.map((step) => (
                  <button key={step.key} onClick={() => router.push(step.route)} className="flex items-center gap-2.5 text-left hover:opacity-80">
                    <span className={`w-4 h-4 rounded-full border flex-shrink-0 flex items-center justify-center text-[9px] ${step.done ? "bg-teal border-teal text-[#14151C]" : "border-line"}`}>
                      {step.done ? "✓" : ""}
                    </span>
                    <span className={`text-sm ${step.done ? "text-textMuted line-through" : "text-textMain"}`}>{step.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {pendingFriendReqs.length > 0 && (
            <div className="card mb-5">
              <div className="font-semibold text-textMain text-sm mb-3">Freundschaftsanfragen</div>
              <div className="flex flex-col gap-2.5">
                {pendingFriendReqs.map((r) => {
                  const busy = friendReqBusyId === r.id;
                  return (
                    <div key={r.id} className="flex items-center gap-3">
                      <Avatar name={r.profile?.full_name || "?"} src={r.profile?.avatar_url} size={32} />
                      <span className="text-sm text-textMain flex-1 truncate">{r.profile?.full_name || "Unbenannt"}</span>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button disabled={busy} onClick={() => respondFriendRequest(r.id, "accepted")} className="btn-ghost text-xs text-teal border-teal/40 disabled:opacity-40">Annehmen</button>
                        <button disabled={busy} onClick={() => respondFriendRequest(r.id, "declined")} className="btn-ghost text-xs text-coral border-coral/40 disabled:opacity-40">Ablehnen</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {upcomingLeads.length > 0 && (
            <div className="card mb-5 cursor-pointer" onClick={() => router.push("/termine")}>
              <div className="font-semibold text-textMain text-sm mb-3">📅 Anstehende Termine</div>
              <div className="flex flex-col gap-2.5">
                {upcomingLeads.map((l) => (
                  <div key={l.id} className="flex items-center gap-3">
                    <span className="text-sm text-textMain flex-1 truncate">{l.name}{l.company ? ` · ${l.company}` : ""}</span>
                    <span className="text-xs font-mono text-textMuted flex-shrink-0">
                      {new Date(l.appointment_at).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })} · {new Date(l.appointment_at).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {teamUpcomingLeads.length > 0 && (
            <div className="card mb-5 cursor-pointer" onClick={() => router.push("/termine")}>
              <div className="font-semibold text-textMain text-sm mb-3">📅 Anstehende Termine im Team</div>
              <div className="flex flex-col gap-2.5">
                {teamUpcomingLeads.map((l) => (
                  <div key={l.id} className="flex items-center gap-3">
                    <span className="text-sm text-textMain flex-1 truncate">{l.name}{l.company ? ` · ${l.company}` : ""}</span>
                    <span className="text-xs text-textMuted flex-shrink-0">{l.creatorName || "Unbenannt"}</span>
                    <span className="text-xs font-mono text-textMuted flex-shrink-0">
                      {new Date(l.appointment_at).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })} · {new Date(l.appointment_at).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {myMentions.length > 0 && (
            <div className="card mb-5">
              <div className="font-semibold text-textMain text-sm mb-3">🔔 Erwähnungen</div>
              <div className="flex flex-col gap-2">
                {myMentions.map((m) => (
                  <button key={m.id} onClick={() => router.push(m.route)} className="text-left text-sm hover:opacity-80">
                    <span className="text-amber font-semibold">{m.actorName}</span>{" "}
                    <span className="text-textMuted">hat dich erwähnt — {m.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {myOpenTasks.length > 0 && (
            <div className="card mb-5 cursor-pointer" onClick={() => router.push("/termine")}>
              <div className="font-semibold text-textMain text-sm mb-3">✅ Offene Aufgaben</div>
              <div className="flex flex-col gap-2">
                {myOpenTasks.map((t) => {
                  const urgency = taskUrgency(t.due_date, false);
                  const style = urgency ? URGENCY_STYLES[urgency.level] : null;
                  return (
                    <div key={t.id} className={`flex items-center gap-3 rounded-lg border px-2.5 py-2 ${style ? `${style.border} ${style.bg}` : "border-line"}`}>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-textMain font-medium truncate">{t.title}</div>
                        <div className="text-xs text-textMuted truncate">Termin: {t.leadName} · von {t.assignedByName}</div>
                      </div>
                      {urgency && (
                        <span className={`text-xs font-semibold flex-shrink-0 ${style.text}`}>{urgency.countdown}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {adminSnapshot && (
            <div className="card mb-5 cursor-pointer" onClick={() => router.push("/admin/insights")}>
              <div className="flex items-center justify-between mb-3">
                <span className="font-semibold text-textMain text-sm">📊 Insights (Admin)</span>
                <span className="text-xs text-amber">Alle Details →</span>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <div className="font-display text-xl font-bold text-textMain">{adminSnapshot.totalMembers}</div>
                  <div className="text-[11px] text-textMuted">Mitglieder</div>
                </div>
                <div>
                  <div className="font-display text-xl font-bold text-textMain">{adminSnapshot.weeklyActiveCount}</div>
                  <div className="text-[11px] text-textMuted">Aktiv diese Woche</div>
                </div>
                <div>
                  <div className="font-display text-xl font-bold text-textMain">{adminSnapshot.pendingCount}</div>
                  <div className="text-[11px] text-textMuted">Warten auf Freigabe</div>
                </div>
              </div>
            </div>
          )}

          {loading ? (
            <p className="text-textMuted text-sm">Lädt...</p>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 mb-5">
                {(() => {
                  const allTiles = [
                    { key: "messages", label: "Nachrichten", icon: "chat", route: "/messages", badge: hub.unreadMessages },
                    { key: "members", label: "Mitglieder", icon: "users", route: "/members", badge: hub.pendingFriendRequests },
                    { key: "community", label: "Community", icon: "users", route: "/community", badge: hub.unreadCommunity },
                    { key: "daily-challenge", label: "Tages-Challenge", icon: "flame", route: "/daily-challenge", sub: profile?.streak_count ? `${profile.streak_count} Tage Serie` : null },
                    { key: "duel", label: "Quiz-Duell", icon: "target", route: "/duel", badge: hub.openDuels },
                    { key: "flashcards", label: "Flashcards", icon: "library", route: "/flashcards", sub: hub.dueFlashcards > 0 ? `${hub.dueFlashcards} fällig` : "Alles erledigt" },
                    { key: "simulator", label: "Simulator", icon: "chat", route: "/simulator" },
                    { key: "leaderboard", label: "Rangliste", icon: "award", route: "/leaderboard" },
                    ...(hub.isManager ? [
                      { key: "admin", label: "Freigaben", icon: "lock", route: "/admin", badge: hub.pendingApprovals },
                      { key: "admin-suggestions", label: "Wissens-Vorschläge", icon: "lock", route: "/admin/suggestions", badge: hub.pendingSuggestions },
                    ] : []),
                  ];
                  const prefs = dashboardPrefs || {};
                  const order = prefs.order || [];
                  const hidden = new Set(prefs.hidden || []);
                  const visibleTiles = allTiles.filter((t) => !hidden.has(t.key));
                  visibleTiles.sort((a, b) => {
                    const ia = order.indexOf(a.key), ib = order.indexOf(b.key);
                    if (ia === -1 && ib === -1) return 0;
                    if (ia === -1) return 1;
                    if (ib === -1) return -1;
                    return ia - ib;
                  });
                  return visibleTiles.map((t) => (
                    <button key={t.key} draggable
                      onDragStart={() => setDraggedTileKey(t.key)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => handleTileDrop(t.key, visibleTiles)}
                      onClick={() => router.push(t.route)}
                      className={`card !p-3.5 flex flex-col items-start gap-2 text-left hover:-translate-y-0.5 transition cursor-grab active:cursor-grabbing ${draggedTileKey === t.key ? "opacity-40" : ""}`}>
                      <div className="flex items-center justify-between w-full">
                        <Icon name={t.icon} color="var(--org-accent, #CE3A5C)" size={18} />
                        {t.badge > 0 && <span className="badge-count">{t.badge > 9 ? "9+" : t.badge}</span>}
                      </div>
                      <div className="text-[13px] font-semibold text-textMain">{t.label}</div>
                      {t.sub && <div className="text-[11px] text-textMuted">{t.sub}</div>}
                    </button>
                  ));
                })()}
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5 mb-5">
                <div className="card"><div className="text-[11px] text-textMuted uppercase mb-1.5">Module abgeschlossen</div><div className="text-2xl font-display font-bold text-textMain font-mono">{doneModuleIds.size}/{totalModules}</div></div>
                <div className="card"><div className="text-[11px] text-textMuted uppercase mb-1.5">Ø MC-Ergebnis</div><div className="text-2xl font-display font-bold text-textMain font-mono">{avgMc !== null ? avgMc + "%" : "–"}</div></div>
                <div className="card"><div className="text-[11px] text-textMuted uppercase mb-1.5">Zertifikate</div><div className="text-2xl font-display font-bold text-textMain font-mono">{certCount}/{COURSES.length}</div></div>
                <div className="card"><div className="text-[11px] text-textMuted uppercase mb-1.5">Rollenspiele</div><div className="text-2xl font-display font-bold text-textMain font-mono">{rpSessions.length}</div></div>
              </div>

              <div className="card mb-5">
                <div className="flex items-center gap-2 mb-3"><Icon name="award" color="var(--org-accent, #CE3A5C)" /><strong className="text-sm">Kurs-Übersicht</strong></div>
                <div className="flex flex-col gap-2">
                  {COURSES.map((c) => {
                    const doneCount = c.modules.filter((m) => doneModuleIds.has(m.id)).length;
                    const passed = examResults.some((r) => r.course_id === c.id && r.passed);
                    return (
                      <div key={c.id} className="flex items-center gap-3 text-sm">
                        <span style={{ color: c.accent }}>{passed ? <Icon name="check" size={14} /> : <Icon name="book" size={14} />}</span>
                        <span className="flex-1 text-textMain">{c.title}</span>
                        <span className="text-textMuted font-mono text-xs">{doneCount}/{c.modules.length} Module</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="card">
                <div className="flex items-center gap-2 mb-3"><Icon name="target" color="var(--org-accent, #CE3A5C)" /><strong className="text-sm">Nächster Schritt</strong></div>
                {nextCourse ? (
                  <>
                    <p className="text-sm text-textMuted mb-3">Weiter mit: <strong className="text-textMain">{nextCourse.title}</strong> – {nextCourse.desc}</p>
                    <button className="btn" onClick={() => router.push("/courses")}>Kurse öffnen <Icon name="chevron" size={14} /></button>
                  </>
                ) : (
                  <>
                    <p className="text-sm text-textMuted mb-3">Alle Kurse abgeschlossen — nutze das Rollenspiel weiter zur Vertiefung.</p>
                    <button className="btn" onClick={() => router.push("/roleplay")}>Zum Rollenspiel <Icon name="chevron" size={14} /></button>
                  </>
                )}
              </div>
            </>
          )}
        </>
      )}
    </Layout>
  );
}

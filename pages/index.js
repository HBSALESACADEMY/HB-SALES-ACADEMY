import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Layout, { patchCachedProfile } from "../components/Layout";
import Icon from "../components/Icon";
import Avatar from "../components/Avatar";
import { supabase } from "../lib/supabaseClient";
import { getUnreadMessageInfo } from "../lib/unreadMessages";
import { COURSES } from "../lib/curriculum";
import { taskUrgency, URGENCY_STYLES } from "../lib/taskUrgency";
import { ABSTAND } from "../lib/autoRefresh";
import { apiGet } from "../lib/apiClient";
import { aendereGeprueft } from "../lib/loeschen";
import { deutscheZeit } from "../lib/terminzeit";
import { berlinHeute, tagPlus } from "../lib/woche";
import { feldFarbe } from "../lib/diagrammFarben";
import LogoHintergrund from "../components/LogoHintergrund";
import { goalMetricLabel } from "../lib/goalMetrics";
import { tagesSchluessel } from "../lib/dateRange";
import { zeitraumLabel } from "../lib/zielzeitraum";
import { DASHBOARD_KACHELN, sichtbareKacheln } from "../lib/dashboardKacheln";

export default function Dashboard() {
  const router = useRouter();
  const [quizResults, setQuizResults] = useState([]);
  const [examResults, setExamResults] = useState([]);
  const [rpSessions, setRpSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [hub, setHub] = useState({ unreadMessages: 0, unreadCommunity: 0, openDuels: 0, dueFlashcards: 0, pendingApprovals: 0, pendingSuggestions: 0, pendingFriendRequests: 0, isManager: false });
  const [draggedTileKey, setDraggedTileKey] = useState(null);
  // Schnellzugriff bearbeiten: direkt dort, wo die Kacheln stehen.
  const [kachelnBearbeiten, setKachelnBearbeiten] = useState(false);
  const [dashboardPrefs, setDashboardPrefs] = useState({});
  const [onboarding, setOnboarding] = useState(null); // null = noch nicht geladen/nicht nötig
  const [adminSnapshot, setAdminSnapshot] = useState(null);
  const [pendingFriendReqs, setPendingFriendReqs] = useState([]);
  const [friendReqBusyId, setFriendReqBusyId] = useState(null);
  const [upcomingLeads, setUpcomingLeads] = useState([]);
  const [teamUpcomingLeads, setTeamUpcomingLeads] = useState([]);
  const [myMentions, setMyMentions] = useState([]);
  const [myOpenTasks, setMyOpenTasks] = useState([]);
  // Offene Termin-Einladungen: sie brauchen eine Antwort, gehören also
  // nach oben zu dem, was heute zu tun ist (migration_112).
  const [einladungen, setEinladungen] = useState([]);
  const [einladungBusy, setEinladungBusy] = useState(null);
  // Eigene Anruf-Leistung. Aus call_log_days, nicht aus dem lokalen Speicher
  // des Call Trackers: der liegt auf EINEM Gerät, das Dashboard schaut man
  // auch mal vom Handy an.
  const [leistung, setLeistung] = useState(null);
  const [teamZiele, setTeamZiele] = useState([]);
  const [showCourseList, setShowCourseList] = useState(false);

  async function ladeEinladungen() {
    try {
      const { einladungen: offene } = await apiGet("/api/einladungen");
      setEinladungen(offene || []);
    } catch (e) {
      // Eine fehlende Einladungsliste darf das Dashboard nicht aufhalten.
      setEinladungen([]);
    }
  }

  // Zu- und absagen darf nur die eingeladene Person selbst — das erzwingt
  // die Datenbank. Hier verschwindet die Karte sofort, das Ergebnis wird
  // danach geprüft.
  async function beantworteEinladung(id, status) {
    setEinladungBusy(id);
    setEinladungen((prev) => prev.filter((e) => e.id !== id));
    const fehler = await aendereGeprueft(
      supabase.from("termin_einladungen").update({ status, beantwortet_am: new Date().toISOString() }).eq("id", id),
      "Nur die eingeladene Person selbst kann zu- oder absagen."
    );
    if (fehler) await ladeEinladungen();
    setEinladungBusy(null);
  }

  // Die letzten sieben Tage, in deutschen Kalendertagen gerechnet — sonst
  // fiele je nach Uhrzeit ein Tag heraus (siehe lib/woche.js).
  async function ladeLeistung(uid) {
    const heute = berlinHeute();
    const von = tagPlus(heute, -6);
    const { data } = await supabase.from("call_log_days")
      .select("log_date, counts").eq("user_id", uid).gte("log_date", von);
    const zeilen = data || [];
    const summe = (schluessel, nurHeute) => zeilen
      .filter((z) => (nurHeute ? z.log_date === heute : true))
      .reduce((s, z) => s + (z.counts?.[schluessel] || 0), 0);

    setLeistung({
      heute: summe("anwahlen", true),
      woche: summe("anwahlen", false),
      erreicht: summe("erreicht", false),
      termin: summe("termin", false),
      // Ein Balken je Tag, älteste links: die Woche auf einen Blick.
      tage: Array.from({ length: 7 }, (_, i) => {
        const tag = tagPlus(heute, -(6 - i));
        return { tag, wert: zeilen.filter((z) => z.log_date === tag).reduce((s, z) => s + (z.counts?.anwahlen || 0), 0) };
      }),
    });
  }

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

  // Ein- und Ausblenden schreibt eine ausdrückliche Auswahl. Danach zählt
  // nur noch sie — neue Kacheln drängen sich niemandem mehr auf.
  function kachelUmschalten(key, istFuehrung) {
    setDashboardPrefs((prev) => {
      const aktuell = sichtbareKacheln(prev, istFuehrung).map((k) => k.key);
      const naechste = aktuell.includes(key) ? aktuell.filter((k) => k !== key) : [...aktuell, key];
      const next = { ...prev, sichtbar: naechste, hidden: (prev?.hidden || []).filter((k) => k !== key) };
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
      ladeLeistung(uid);
      setQuizResults(qr || []);
      setExamResults(er || []);
      setRpSessions(rp || []);
      setLoading(false);
      loadPendingFriendRequests(uid);
      ladeEinladungen();

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

      const today = tagesSchluessel();
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
        // Eigene Termine werden schon oben in "Anstehende Termine" gezeigt —
        // hier ausschließen, sonst tauchen sie doppelt auf.
        const { data: teamLeads } = await supabase.from("leads").select("id, name, company, appointment_at, created_by")
          .eq("status", "geplant").not("appointment_at", "is", null).neq("created_by", uid)
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

      // Team-Ziele über dieselbe Route wie die Seite "Mein Team", damit hier
      // und dort dieselben Zahlen stehen. Scheitert der Aufruf, bleibt das
      // Dashboard vollständig nutzbar — der Block fehlt dann einfach.
      try {
        const { teams } = await apiGet("/api/team-goals");
        setTeamZiele((teams || []).flatMap((t) => (t.ziele || []).map((z) => ({ ...z, teamName: t.name }))));
      } catch (e) {
        console.error("Team-Ziele fürs Dashboard:", e.message);
        setTeamZiele([]);
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
    // Nur abfragen, wenn der Tab sichtbar ist; beim Zurückwechseln sofort.
    // Abstand: Dashboard hat eine Echtzeit-Verbindung über 10 Tabellen.
    const interval = setInterval(() => { if (!document.hidden) (load)(); }, ABSTAND.MIT_ECHTZEIT);
    const beiSichtbar = () => { if (!document.hidden) (load)(); };
    document.addEventListener("visibilitychange", beiSichtbar);
    return () => { supabase.removeChannel(channel); clearInterval(interval); document.removeEventListener("visibilitychange", beiSichtbar); };
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
          {/* Begrüssung mit dem Logo der eigenen Firma dahinter: eine ruhige
              Fläche, auf der es als Zugehörigkeit wirkt und nichts verdeckt. */}
          <div className="card mb-6 relative overflow-hidden">
            <LogoHintergrund breite="w-1/3" hoehe="max-h-[80%]" />
            <div className="relative">
              <h1 className="text-2xl font-display font-medium brand-text-gradient mb-1">Willkommen zurück{profile?.full_name ? `, ${profile.full_name}` : ""}</h1>
              <div className="brand-stripe w-16 mb-3" />
              <p className="text-textMuted text-sm">Dein Überblick über Fortschritt und nächste Schritte.</p>
            </div>
          </div>

          {/* Die eigene Leistung ganz oben: jede Person sieht ihre Zahlen,
              ohne erst in den Call Tracker zu wechseln. Nur die EIGENEN —
              wer die des Teams sehen darf, findet sie dort. */}
          {leistung && leistung.woche === 0 && leistung.heute === 0 && (
            <div className="card mb-5 flex items-center gap-3 cursor-pointer" onClick={() => router.push("/call-tracker")}>
              <Icon name="phone" color={feldFarbe("anwahlen")} size={18} />
              <span className="text-sm text-textMuted flex-1">
                Noch keine Anwahlen erfasst. Im Call Tracker zählst du sie mit einem Tipp — dann steht deine Leistung hier.
              </span>
              <span className="text-[11px] text-textMuted">Öffnen →</span>
            </div>
          )}

          {leistung && (leistung.woche > 0 || leistung.heute > 0) && (
            <div className="card mb-5 cursor-pointer" onClick={() => router.push("/call-tracker")}>
              <div className="flex items-center gap-2 mb-3 flex-wrap">
                <span className="text-[11px] uppercase tracking-wide text-textMuted">Deine Anwahlen</span>
                <span className="text-[11px] text-textMuted">· letzte 7 Tage</span>
                <span className="text-[11px] text-textMuted ml-auto">Zum Call Tracker →</span>
              </div>
              <div className="flex items-end gap-5 flex-wrap">
                <div>
                  <div className="text-3xl font-display font-semibold" style={{ color: feldFarbe("anwahlen") }}>{leistung.heute}</div>
                  <div className="text-[11px] text-textMuted">heute</div>
                </div>
                <div>
                  <div className="text-2xl font-display font-semibold text-textMain">{leistung.woche}</div>
                  <div className="text-[11px] text-textMuted">in 7 Tagen</div>
                </div>
                <div>
                  <div className="text-2xl font-display font-semibold" style={{ color: feldFarbe("erreicht") }}>{leistung.erreicht}</div>
                  <div className="text-[11px] text-textMuted">erreicht</div>
                </div>
                <div>
                  <div className="text-2xl font-display font-semibold" style={{ color: feldFarbe("termin") }}>{leistung.termin}</div>
                  <div className="text-[11px] text-textMuted">terminiert</div>
                </div>

                {/* Ein Balken je Tag, ältester links. Zeigt den Verlauf, ohne
                    ein zweites Diagramm zu brauchen. */}
                <div className="flex items-end gap-1 h-12 ml-auto">
                  {leistung.tage.map((t) => {
                    const groesster = Math.max(1, ...leistung.tage.map((x) => x.wert));
                    const heute = t.tag === berlinHeute();
                    return (
                      <div key={t.tag} className="flex flex-col items-center gap-1" title={`${t.wert} Anwahlen`}>
                        <div className="w-3 rounded-t transition-all duration-300"
                          style={{
                            height: `${Math.max(2, Math.round((t.wert / groesster) * 38))}px`,
                            background: heute ? feldFarbe("anwahlen") : `color-mix(in srgb, ${feldFarbe("anwahlen")} 45%, transparent)`,
                          }} />
                        <span className="text-[9px] text-textMuted">
                          {new Date(`${t.tag}T12:00:00`).toLocaleDateString("de-DE", { weekday: "short" }).slice(0, 2)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {profile?.streak_count > 0 && profile?.last_challenge_date !== tagesSchluessel() && (
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

          {/* Einladungen zuerst: sie warten auf eine Antwort, alles andere
              ist nur Anzeige. */}
          {einladungen.length > 0 && (
            <div className="card mb-5 border-amber/40 flex flex-col gap-3">
              <div className="text-sm font-semibold text-amber">
                {einladungen.length === 1 ? "Du bist zu einem Termin eingeladen" : `${einladungen.length} Termin-Einladungen für dich`}
              </div>
              {einladungen.map((e) => (
                <div key={e.id} className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm text-textMain">{e.titel}</span>
                  <span className="text-xs text-textMuted">
                    {e.zeitpunkt
                      ? `${deutscheZeit(e.zeitpunkt)} Uhr`
                      : `${e.tag.slice(8)}.${e.tag.slice(5, 7)}.${e.uhrzeit ? ` · ${e.uhrzeit}` : ""}`}
                    {" · von "}{e.von_name}
                  </span>
                  <span className="flex items-center gap-1.5 ml-auto">
                    <button disabled={einladungBusy === e.id} onClick={() => beantworteEinladung(e.id, "zugesagt")} className="btn text-xs disabled:opacity-40">Annehmen</button>
                    <button disabled={einladungBusy === e.id} onClick={() => beantworteEinladung(e.id, "abgesagt")} className="btn-ghost text-xs disabled:opacity-40">Ablehnen</button>
                  </span>
                </div>
              ))}
              <p className="text-[11px] text-textMuted">Zugesagte Termine stehen danach in deinem Kalender.</p>
            </div>
          )}

          {(myOpenTasks.length > 0 || upcomingLeads.length > 0) && (
            <div className="card mb-5 flex flex-col gap-4">
              <div className="text-[11px] uppercase tracking-wide text-textMuted">Heute</div>
              {myOpenTasks.length > 0 && (
                <div className="">
                  <div className="font-semibold text-textMain text-sm mb-2.5 cursor-pointer" onClick={() => router.push("/termine")}>✅ Offene Aufgaben</div>
                  <div className="flex flex-col gap-2">
                    {myOpenTasks.slice(0, 3).map((t) => {
                      const urgency = taskUrgency(t.due_date, false);
                      const style = urgency ? URGENCY_STYLES[urgency.level] : null;
                      return (
                        <div key={t.id} onClick={() => router.push(`/termine?leadId=${t.lead_id}`)} className={`flex items-center gap-3 rounded-lg border px-2.5 py-2 cursor-pointer ${style ? `${style.border} ${style.bg}` : "border-line"}`}>
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
                    {myOpenTasks.length > 3 && <span className="text-xs text-textMuted">+{myOpenTasks.length - 3} weitere</span>}
                  </div>
                </div>
              )}

              {upcomingLeads.length > 0 && (
                <div className="">
                  <div className="font-semibold text-textMain text-sm mb-2.5 cursor-pointer" onClick={() => router.push("/termine")}>📅 Anstehende Termine</div>
                  <div className="flex flex-col gap-2.5">
                    {upcomingLeads.slice(0, 3).map((l) => (
                      <div key={l.id} onClick={() => router.push("/termine")} className="flex items-center gap-3 cursor-pointer">
                        <span className="text-sm text-textMain flex-1 truncate">{l.name}{l.company ? ` · ${l.company}` : ""}</span>
                        <span className="text-xs font-mono text-textMuted flex-shrink-0">
                          {new Date(l.appointment_at).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })} · {new Date(l.appointment_at).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                    ))}
                    {upcomingLeads.length > 3 && <span className="text-xs text-textMuted">+{upcomingLeads.length - 3} weitere</span>}
                  </div>
                </div>
              )}

            </div>
          )}

          {(teamZiele.length > 0 || teamUpcomingLeads.length > 0) && (
            <div className="card mb-5 flex flex-col gap-4">
              <div className="text-[11px] uppercase tracking-wide text-textMuted">Mein Team</div>
              {teamZiele.length > 0 && (
                <div className="">
                  <div className="font-semibold text-textMain text-sm mb-2.5 cursor-pointer" onClick={() => router.push("/team")}>🎯 Team-Ziele</div>
                  <div className="flex flex-col gap-2.5">
                    {teamZiele.slice(0, 3).map((z) => (
                      <div key={z.id} onClick={() => router.push("/team")} className="cursor-pointer">
                        <div className="flex items-center justify-between gap-2 mb-1.5">
                          {/* Der Zeitraum gehört dazu: seit migration_96 kann
                              ein Ziel über eine Woche, einen Monat oder ein
                              Quartal laufen. Die Überschrift sagte pauschal
                              "diese Woche" — bei einem Quartalsziel schlicht
                              falsch. */}
                          <span className="text-xs text-textMuted min-w-0 truncate">
                            {z.title}
                            {z.von && z.bis && <span className="text-textMuted"> · {zeitraumLabel(z.von, z.bis)}</span>}
                          </span>
                          <span className="text-xs text-textMuted flex-shrink-0 font-mono">{z.fortschritt}/{z.target_count} {goalMetricLabel(z.metric)}</span>
                        </div>
                        <div className="h-2 bg-line rounded-full overflow-hidden">
                          <div className="h-full brand-gradient transition-all" style={{ width: `${Math.min(100, (z.fortschritt / z.target_count) * 100)}%` }} />
                        </div>
                      </div>
                    ))}
                    {teamZiele.length > 3 && <span className="text-xs text-textMuted">+{teamZiele.length - 3} weitere</span>}
                  </div>
                </div>
              )}
              {teamUpcomingLeads.length > 0 && (
                <div className="">
                  <div className="font-semibold text-textMain text-sm mb-2.5 cursor-pointer" onClick={() => router.push("/termine")}>📅 Anstehende Termine im Team</div>
                  <div className="flex flex-col gap-2.5">
                    {teamUpcomingLeads.slice(0, 3).map((l) => (
                      <div key={l.id} onClick={() => router.push("/termine")} className="flex items-center gap-3 cursor-pointer">
                        <span className="text-sm text-textMain flex-1 truncate">{l.name}{l.company ? ` · ${l.company}` : ""}</span>
                        <span className="text-xs text-textMuted flex-shrink-0">{l.creatorName || "Unbenannt"}</span>
                        <span className="text-xs font-mono text-textMuted flex-shrink-0">
                          {new Date(l.appointment_at).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })} · {new Date(l.appointment_at).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                    ))}
                    {teamUpcomingLeads.length > 3 && <span className="text-xs text-textMuted">+{teamUpcomingLeads.length - 3} weitere</span>}
                  </div>
                </div>
              )}

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

              <div className="text-[11px] uppercase tracking-wide text-textMuted mb-2">Mein Fortschritt</div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5 mb-5">
                <div className="card"><div className="text-[11px] text-textMuted uppercase mb-1.5">Module abgeschlossen</div><div className="text-2xl font-display font-bold text-textMain font-mono">{doneModuleIds.size}/{totalModules}</div></div>
                <div className="card"><div className="text-[11px] text-textMuted uppercase mb-1.5">Ø MC-Ergebnis</div><div className="text-2xl font-display font-bold text-textMain font-mono">{avgMc !== null ? avgMc + "%" : "–"}</div></div>
                <div className="card"><div className="text-[11px] text-textMuted uppercase mb-1.5">Zertifikate</div><div className="text-2xl font-display font-bold text-textMain font-mono">{certCount}/{COURSES.length}</div></div>
                <div className="card"><div className="text-[11px] text-textMuted uppercase mb-1.5">Rollenspiele</div><div className="text-2xl font-display font-bold text-textMain font-mono">{rpSessions.length}</div></div>
              </div>

              <div className="card mb-5">
                <button onClick={() => setShowCourseList((v) => !v)} className="flex items-center gap-2 w-full text-left">
                  <Icon name="award" color="var(--org-accent, #CE3A5C)" />
                  <strong className="text-sm flex-1">Kurs-Übersicht</strong>
                  <span className="text-xs text-textMuted">{showCourseList ? "Einklappen" : "Alle anzeigen"}</span>
                </button>
                {showCourseList && (
                  <div className="flex flex-col gap-2 mt-3">
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
                )}
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

              {/* Schnellzugriff und Austausch stehen bewusst unten: sie sind
                  Absprünge, keine Aufgaben. Oben gehört hin, was heute zu tun ist. */}
              <div className="flex items-center gap-2 mt-5 mb-2">
                <span className="text-[11px] uppercase tracking-wide text-textMuted">Schnellzugriff</span>
                <button onClick={() => setKachelnBearbeiten((v) => !v)} className="btn-ghost text-[11px] ml-auto">
                  {kachelnBearbeiten ? "Fertig" : "Bearbeiten"}
                </button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 mb-5">
                {(() => {
                  // Zähler und Untertitel gehören ins Dashboard, die Liste
                  // selbst nach lib/dashboardKacheln.js — sonst steht sie an
                  // zwei Stellen und läuft auseinander.
                  const zusatz = {
                    messages: { badge: hub.unreadMessages },
                    members: { badge: hub.pendingFriendRequests },
                    community: { badge: hub.unreadCommunity },
                    duel: { badge: hub.openDuels },
                    admin: { badge: hub.pendingApprovals },
                    "admin-suggestions": { badge: hub.pendingSuggestions },
                    "daily-challenge": { sub: profile?.streak_count ? `${profile.streak_count} Tage Serie` : null },
                    flashcards: { sub: hub.dueFlashcards > 0 ? `${hub.dueFlashcards} fällig` : "Alles erledigt" },
                  };
                  const visibleTiles = sichtbareKacheln(dashboardPrefs || {}, hub.isManager)
                    .map((k) => ({ ...k, ...(zusatz[k.key] || {}) }));
                  return visibleTiles.map((t) => (
                    <button key={t.key} draggable={!kachelnBearbeiten}
                      onDragStart={() => setDraggedTileKey(t.key)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => handleTileDrop(t.key, visibleTiles)}
                      onClick={() => (kachelnBearbeiten ? kachelUmschalten(t.key, hub.isManager) : router.push(t.route))}
                      className={`card !p-3.5 flex flex-col items-start gap-2 text-left hover:-translate-y-0.5 transition ${kachelnBearbeiten ? "border-coral/40 cursor-pointer" : "cursor-grab active:cursor-grabbing"} ${draggedTileKey === t.key ? "opacity-40" : ""}`}>
                      <div className="flex items-center justify-between w-full">
                        <Icon name={t.icon} color="var(--org-accent, #CE3A5C)" size={18} />
                        {kachelnBearbeiten
                          ? <span className="text-coral text-xs" title="Ausblenden">✕</span>
                          : t.badge > 0 && <span className="badge-count">{t.badge > 9 ? "9+" : t.badge}</span>}
                      </div>
                      <div className="text-[13px] font-semibold text-textMain">{t.label}</div>
                      {!kachelnBearbeiten && t.sub && <div className="text-[11px] text-textMuted">{t.sub}</div>}
                    </button>
                  ));
                })()}
              </div>

              {/* Im Bearbeiten-Modus steht darunter, was noch dazukommen
                  kann — sonst müsste man raten, was es überhaupt gibt. */}
              {kachelnBearbeiten && (() => {
                const sichtbar = new Set(sichtbareKacheln(dashboardPrefs || {}, hub.isManager).map((k) => k.key));
                const rest = DASHBOARD_KACHELN.filter((k) => !sichtbar.has(k.key) && (!k.nurFuehrung || hub.isManager));
                return (
                  <div className="card mb-5">
                    <div className="text-[11px] uppercase tracking-wide text-textMuted mb-2">Hinzufügen</div>
                    {rest.length === 0 ? (
                      <p className="text-xs text-textMuted">Alle Kacheln sind schon auf dem Dashboard.</p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {rest.map((k) => (
                          <button key={k.key} onClick={() => kachelUmschalten(k.key, hub.isManager)}
                            className="btn-ghost text-xs flex items-center gap-1.5">
                            <Icon name={k.icon} size={12} /> + {k.label}
                          </button>
                        ))}
                      </div>
                    )}
                    <p className="text-[11px] text-textMuted mt-2">
                      Klick auf eine Kachel oben blendet sie aus. Die Reihenfolge änderst du ausserhalb des
                      Bearbeitens per Ziehen. Deine Auswahl gilt nur für dich.
                    </p>
                  </div>
                );
              })()}
            </>
          )}

          {(pendingFriendReqs.length > 0 || myMentions.length > 0) && (
            <div className="card mb-5 flex flex-col gap-4">
              <div className="text-[11px] uppercase tracking-wide text-textMuted">Austausch</div>
              {pendingFriendReqs.length > 0 && (
                <div>
                  <div className="font-semibold text-textMain text-sm mb-2.5">🤝 Freundschaftsanfragen</div>
                  <div className="flex flex-col gap-2.5">
                    {pendingFriendReqs.slice(0, 3).map((r) => {
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
                    {pendingFriendReqs.length > 3 && <span className="text-xs text-textMuted">+{pendingFriendReqs.length - 3} weitere</span>}
                  </div>
                </div>
              )}

              {myMentions.length > 0 && (
                <div className="">
                  <div className="font-semibold text-textMain text-sm mb-2.5">🔔 Erwähnungen</div>
                  <div className="flex flex-col gap-2">
                    {myMentions.slice(0, 3).map((m) => (
                      <button key={m.id} onClick={() => router.push(m.route)} className="text-left text-sm hover:opacity-80">
                        <span className="text-amber font-semibold">{m.actorName}</span>{" "}
                        <span className="text-textMuted">hat dich erwähnt — {m.label}</span>
                      </button>
                    ))}
                    {myMentions.length > 3 && <span className="text-xs text-textMuted">+{myMentions.length - 3} weitere</span>}
                  </div>
                </div>
              )}

            </div>
          )}

        </>
      )}
    </Layout>
  );
}

import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Layout, { patchCachedProfile } from "../components/Layout";
import Icon from "../components/Icon";
import { supabase } from "../lib/supabaseClient";
import { COURSES } from "../lib/curriculum";

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
        supabase.from("quiz_results").select("*").eq("user_id", uid),
        supabase.from("exam_results").select("*").eq("user_id", uid),
        supabase.from("roleplay_sessions").select("*").eq("user_id", uid),
      ]);
      setQuizResults(qr || []);
      setExamResults(er || []);
      setRpSessions(rp || []);
      setLoading(false);

      const { data: me } = await supabase.from("profiles").select("role, last_seen_community_at, dashboard_prefs, onboarding_dismissed, full_name, bio, avatar_url").eq("id", uid).maybeSingle();
      const since = me?.last_seen_community_at || new Date(0).toISOString();
      setDashboardPrefs(me?.dashboard_prefs || {});

      const [
        { count: msgCount },
        { count: postCount }, { count: commentCount },
        { data: cards }, { data: progress },
        { data: myDuels },
        { count: friendReqCount },
      ] = await Promise.all([
        supabase.from("direct_messages").select("id", { count: "exact", head: true }).eq("recipient_id", uid).is("read_at", null),
        supabase.from("community_posts").select("id", { count: "exact", head: true }).gt("created_at", since).neq("user_id", uid),
        supabase.from("community_comments").select("id", { count: "exact", head: true }).gt("created_at", since).neq("user_id", uid),
        supabase.from("flashcards").select("id"),
        supabase.from("flashcard_progress").select("card_id, next_review_date").eq("user_id", uid),
        supabase.from("duels").select("*").or(`challenger_id.eq.${uid},opponent_id.eq.${uid}`),
        supabase.from("friendships").select("id", { count: "exact", head: true }).eq("addressee_id", uid).eq("status", "pending"),
      ]);

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
    }
    load();
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
          <h1 className="text-2xl font-display font-bold brand-text-gradient mb-1">Willkommen zurück{profile?.full_name ? `, ${profile.full_name}` : ""}</h1>
          <div className="brand-stripe w-16 mb-3" />
          <p className="text-textMuted text-sm mb-6">Dein Überblick über Fortschritt und nächste Schritte.</p>

          {profile?.streak_count > 0 && profile?.last_challenge_date !== new Date().toISOString().slice(0, 10) && (
            <div className="card mb-5 border border-amber/30 flex items-center gap-3 cursor-pointer" onClick={() => router.push("/daily-challenge")}>
              <Icon name="flame" color="#E8368F" size={18} />
              <span className="text-sm text-white flex-1">Deine {profile.streak_count}-Tage-Serie ist in Gefahr — heute noch die Tages-Challenge machen!</span>
            </div>
          )}

          {onboarding && (
            <div className="card mb-5">
              <div className="flex items-center justify-between mb-2.5">
                <span className="font-semibold text-white text-sm">👋 Erste Schritte</span>
                <button onClick={dismissOnboarding} className="text-textMuted hover:text-white text-xs">Ausblenden</button>
              </div>
              <div className="flex flex-col gap-1.5">
                {onboarding.map((step) => (
                  <button key={step.key} onClick={() => router.push(step.route)} className="flex items-center gap-2.5 text-left hover:opacity-80">
                    <span className={`w-4 h-4 rounded-full border flex-shrink-0 flex items-center justify-center text-[9px] ${step.done ? "bg-teal border-teal text-[#0A0C13]" : "border-line"}`}>
                      {step.done ? "✓" : ""}
                    </span>
                    <span className={`text-sm ${step.done ? "text-textMuted line-through" : "text-white"}`}>{step.label}</span>
                  </button>
                ))}
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
                        <Icon name={t.icon} color="#E8368F" size={18} />
                        {t.badge > 0 && <span className="badge-count">{t.badge > 9 ? "9+" : t.badge}</span>}
                      </div>
                      <div className="text-[13px] font-semibold text-white">{t.label}</div>
                      {t.sub && <div className="text-[11px] text-textMuted">{t.sub}</div>}
                    </button>
                  ));
                })()}
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5 mb-5">
                <div className="card"><div className="text-[11px] text-textMuted uppercase mb-1.5">Module abgeschlossen</div><div className="text-2xl font-display font-bold text-white font-mono">{doneModuleIds.size}/{totalModules}</div></div>
                <div className="card"><div className="text-[11px] text-textMuted uppercase mb-1.5">Ø MC-Ergebnis</div><div className="text-2xl font-display font-bold text-white font-mono">{avgMc !== null ? avgMc + "%" : "–"}</div></div>
                <div className="card"><div className="text-[11px] text-textMuted uppercase mb-1.5">Zertifikate</div><div className="text-2xl font-display font-bold text-white font-mono">{certCount}/{COURSES.length}</div></div>
                <div className="card"><div className="text-[11px] text-textMuted uppercase mb-1.5">Rollenspiele</div><div className="text-2xl font-display font-bold text-white font-mono">{rpSessions.length}</div></div>
              </div>

              <div className="card mb-5">
                <div className="flex items-center gap-2 mb-3"><Icon name="award" color="#E8368F" /><strong className="text-sm">Kurs-Übersicht</strong></div>
                <div className="flex flex-col gap-2">
                  {COURSES.map((c) => {
                    const doneCount = c.modules.filter((m) => doneModuleIds.has(m.id)).length;
                    const passed = examResults.some((r) => r.course_id === c.id && r.passed);
                    return (
                      <div key={c.id} className="flex items-center gap-3 text-sm">
                        <span style={{ color: c.accent }}>{passed ? <Icon name="check" size={14} /> : <Icon name="book" size={14} />}</span>
                        <span className="flex-1 text-white">{c.title}</span>
                        <span className="text-textMuted font-mono text-xs">{doneCount}/{c.modules.length} Module</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="card">
                <div className="flex items-center gap-2 mb-3"><Icon name="target" color="#E8368F" /><strong className="text-sm">Nächster Schritt</strong></div>
                {nextCourse ? (
                  <>
                    <p className="text-sm text-textMuted mb-3">Weiter mit: <strong className="text-white">{nextCourse.title}</strong> – {nextCourse.desc}</p>
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

import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Layout from "../components/Layout";
import Icon from "../components/Icon";
import { supabase } from "../lib/supabaseClient";
import { COURSES } from "../lib/curriculum";

export default function Dashboard() {
  const router = useRouter();
  const [quizResults, setQuizResults] = useState([]);
  const [examResults, setExamResults] = useState([]);
  const [rpSessions, setRpSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [hub, setHub] = useState({ unreadMessages: 0, unreadCommunity: 0, openDuels: 0, dueFlashcards: 0, pendingApprovals: 0, pendingSuggestions: 0, isManager: false });

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

      const { data: me } = await supabase.from("profiles").select("role, last_seen_community_at").eq("id", uid).maybeSingle();
      const since = me?.last_seen_community_at || new Date(0).toISOString();

      const [
        { count: msgCount },
        { count: postCount }, { count: commentCount },
        { data: cards }, { data: progress },
        { data: myDuels },
      ] = await Promise.all([
        supabase.from("direct_messages").select("id", { count: "exact", head: true }).eq("recipient_id", uid).is("read_at", null),
        supabase.from("community_posts").select("id", { count: "exact", head: true }).gt("created_at", since).neq("user_id", uid),
        supabase.from("community_comments").select("id", { count: "exact", head: true }).gt("created_at", since).neq("user_id", uid),
        supabase.from("flashcards").select("id"),
        supabase.from("flashcard_progress").select("card_id, next_review_date").eq("user_id", uid),
        supabase.from("duels").select("*").or(`challenger_id.eq.${uid},opponent_id.eq.${uid}`),
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
        isManager: me?.role === "manager",
      });
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

          {loading ? (
            <p className="text-textMuted text-sm">Lädt...</p>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 mb-5">
                {[
                  { label: "Nachrichten", icon: "chat", route: "/messages", badge: hub.unreadMessages },
                  { label: "Community", icon: "users", route: "/community", badge: hub.unreadCommunity },
                  { label: "Tages-Challenge", icon: "flame", route: "/daily-challenge", sub: profile?.streak_count ? `${profile.streak_count} Tage Serie` : null },
                  { label: "Quiz-Duell", icon: "target", route: "/duel", badge: hub.openDuels },
                  { label: "Flashcards", icon: "library", route: "/flashcards", sub: hub.dueFlashcards > 0 ? `${hub.dueFlashcards} fällig` : "Alles erledigt" },
                  { label: "Simulator", icon: "chat", route: "/simulator" },
                  { label: "Rangliste", icon: "award", route: "/leaderboard" },
                  ...(hub.isManager ? [
                    { label: "Freigaben", icon: "lock", route: "/admin", badge: hub.pendingApprovals },
                    { label: "Wissens-Vorschläge", icon: "lock", route: "/admin/suggestions", badge: hub.pendingSuggestions },
                  ] : []),
                ].map((t) => (
                  <button key={t.route} onClick={() => router.push(t.route)}
                    className="card !p-3.5 flex flex-col items-start gap-2 text-left hover:-translate-y-0.5 transition cursor-pointer">
                    <div className="flex items-center justify-between w-full">
                      <Icon name={t.icon} color="#E8368F" size={18} />
                      {t.badge > 0 && <span className="badge-count">{t.badge > 9 ? "9+" : t.badge}</span>}
                    </div>
                    <div className="text-[13px] font-semibold text-white">{t.label}</div>
                    {t.sub && <div className="text-[11px] text-textMuted">{t.sub}</div>}
                  </button>
                ))}
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

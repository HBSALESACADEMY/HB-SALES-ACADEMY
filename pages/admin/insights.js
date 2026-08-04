import { useEffect, useState } from "react";
import Layout from "../../components/Layout";
import Icon from "../../components/Icon";
import Avatar from "../../components/Avatar";
import { supabase } from "../../lib/supabaseClient";
import { openProfile } from "../../lib/profileModalBus";
import { COURSES } from "../../lib/curriculum";
import { downloadCsv } from "../../lib/csv";

export default function AdminInsights() {
  const [isAdmin, setIsAdmin] = useState(true);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { data: me } = await supabase.from("profiles").select("is_admin, is_platform_admin, organization_id").eq("id", session.user.id).maybeSingle();
      if (!me?.is_admin && !me?.is_platform_admin) { setIsAdmin(false); setLoading(false); return; }
      // Plattform-Admins können per Firmencode "als" eine andere
      // Organisation eingeloggt sein (sessionStorage) — dann gelten die
      // Insights für die AKTIVE Organisation, nicht die eigene Heimat-Org.
      const activeOrgId = (me?.is_platform_admin && sessionStorage.getItem("hb_active_org_id")) || me?.organization_id;

      const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();

      const [
        { data: profiles }, { data: quizzes }, { data: exams }, { data: roleplays },
        { data: posts }, { data: comments }, { data: kudos }, { data: logins },
        { data: callLogs },
      ] = await Promise.all([
        // Explizit auf die eigene Organisation eingeschränkt — Profile sind
        // seit der offenen Sichtbarkeit (globale Suche/Community) über RLS
        // allein nicht mehr automatisch organisationsgebunden.
        supabase.from("profiles").select("id, full_name, avatar_url, xp, status, created_at").eq("organization_id", activeOrgId),
        supabase.from("quiz_results").select("id, user_id"),
        supabase.from("exam_results").select("course_id, passed, user_id"),
        supabase.from("roleplay_sessions").select("evaluation_score, user_id"),
        supabase.from("community_posts").select("id, user_id"),
        supabase.from("community_comments").select("id"),
        supabase.from("community_kudos").select("post_id"),
        supabase.from("login_events").select("user_id, created_at").gt("created_at", weekAgo),
        supabase.from("call_log_days").select("counts").gte("log_date", weekAgo.slice(0, 10)),
      ]);

      const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
      const [{ data: pageViews }, { data: navItems }] = await Promise.all([
        supabase.from("page_views").select("path").gt("created_at", thirtyDaysAgo),
        supabase.from("nav_items").select("route, label"),
      ]);
      const labelByRoute = {};
      (navItems || []).forEach((n) => { labelByRoute[n.route] = n.label; });
      const viewCounts = {};
      (pageViews || []).forEach((v) => { viewCounts[v.path] = (viewCounts[v.path] || 0) + 1; });
      const usageRanking = Object.entries(viewCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 12)
        .map(([path, count]) => ({ path, count, label: labelByRoute[path] || path }));

      const approved = (profiles || []).filter((p) => p.status === "approved");
      const pending = (profiles || []).filter((p) => p.status === "pending");
      const totalXp = approved.reduce((s, p) => s + (p.xp || 0), 0);
      const avgXp = approved.length ? Math.round(totalXp / approved.length) : 0;

      const passedByCourse = {};
      (exams || []).forEach((e) => { if (e.passed) passedByCourse[e.course_id] = (passedByCourse[e.course_id] || 0) + 1; });

      const avgRoleplayScore = (roleplays || []).length
        ? Math.round(roleplays.reduce((s, r) => s + (r.evaluation_score || 0), 0) / roleplays.filter((r) => r.evaluation_score != null).length)
        : null;

      const postByUser = {};
      (posts || []).forEach((p) => { postByUser[p.id] = p.user_id; });
      const kudosByAuthor = {};
      (kudos || []).forEach((k) => { const author = postByUser[k.post_id]; if (author) kudosByAuthor[author] = (kudosByAuthor[author] || 0) + 1; });
      const nameById = {};
      (profiles || []).forEach((p) => { nameById[p.id] = p; });
      const topContributors = Object.entries(kudosByAuthor)
        .sort((a, b) => b[1] - a[1]).slice(0, 5)
        .map(([id, count]) => ({ id, count, profile: nameById[id] }));

      // Nur gegen aktuell genehmigte Mitglieder zählen — sonst würden z.B. Login-Events
      // von inzwischen gelöschten/abgelehnten Test-Konten die Zahl über die echte
      // Mitgliederzahl hinaus aufblähen.
      const approvedIds = new Set(approved.map((p) => p.id));
      const weeklyActiveUsers = new Set((logins || []).map((l) => l.user_id).filter((id) => approvedIds.has(id))).size;

      const weeklyAnwahlen = (callLogs || []).reduce((s, c) => s + (c.counts?.anwahlen || 0), 0);

      // Pro-Mitglied-Zeilen für den CSV-Export — Rohdaten aus den bereits
      // geladenen Listen aggregiert, keine zusätzlichen Anfragen nötig.
      const quizCountByUser = {};
      (quizzes || []).forEach((q) => { quizCountByUser[q.user_id] = (quizCountByUser[q.user_id] || 0) + 1; });
      const examsPassedByUser = {};
      (exams || []).forEach((e) => { if (e.passed) examsPassedByUser[e.user_id] = (examsPassedByUser[e.user_id] || 0) + 1; });
      const roleplayCountByUser = {}, roleplayScoreSumByUser = {}, roleplayScoreCountByUser = {};
      (roleplays || []).forEach((r) => {
        roleplayCountByUser[r.user_id] = (roleplayCountByUser[r.user_id] || 0) + 1;
        if (r.evaluation_score != null) {
          roleplayScoreSumByUser[r.user_id] = (roleplayScoreSumByUser[r.user_id] || 0) + r.evaluation_score;
          roleplayScoreCountByUser[r.user_id] = (roleplayScoreCountByUser[r.user_id] || 0) + 1;
        }
      });
      const activeThisWeekIds = new Set((logins || []).map((l) => l.user_id));

      const memberRows = approved.map((p) => ({
        name: p.full_name || "Unbenannt",
        xp: p.xp || 0,
        quizzesAbgeschlossen: quizCountByUser[p.id] || 0,
        pruefungenBestanden: examsPassedByUser[p.id] || 0,
        rollenspiele: roleplayCountByUser[p.id] || 0,
        rollenspielScoreDurchschnitt: roleplayScoreCountByUser[p.id] ? Math.round(roleplayScoreSumByUser[p.id] / roleplayScoreCountByUser[p.id]) : "",
        aktivDieseWoche: activeThisWeekIds.has(p.id) ? "Ja" : "Nein",
        registriertAm: p.created_at ? new Date(p.created_at).toLocaleDateString("de-DE") : "",
      }));

      setStats({
        totalMembers: approved.length,
        pendingMembers: pending.length,
        totalXp, avgXp,
        totalQuizzes: (quizzes || []).length,
        totalExamsPassed: (exams || []).filter((e) => e.passed).length,
        avgRoleplayScore,
        totalRoleplays: (roleplays || []).length,
        totalPosts: (posts || []).length,
        totalComments: (comments || []).length,
        totalKudos: (kudos || []).length,
        weeklyActiveUsers,
        weeklyAnwahlen,
        passedByCourse,
        topContributors,
        usageRanking,
        memberRows,
      });
      setLoading(false);
    }
    load();
    // Automatisch aktuell halten, ohne dass die Seite manuell neu geladen
    // werden muss (z.B. wenn nebenbei jemand eine Prüfung besteht).
    const interval = setInterval(load, 20000);
    return () => clearInterval(interval);
  }, []);

  if (loading) return <Layout><p className="text-textMuted text-sm">Lädt...</p></Layout>;

  if (!isAdmin) {
    return (
      <Layout>
        <h1 className="text-2xl font-display text-textMain mb-1">Insights</h1>
        <p className="text-textMuted text-sm">Diese Ansicht ist nur für Admin-Konten verfügbar.</p>
      </Layout>
    );
  }

  const tiles = [
    { label: "Mitglieder", value: stats.totalMembers, icon: "users", color: "var(--org-accent, #CE3A5C)", sub: stats.pendingMembers > 0 ? `${stats.pendingMembers} warten auf Freigabe` : null },
    { label: "Aktiv diese Woche", value: stats.weeklyActiveUsers, icon: "flame", color: "#00E5C7" },
    { label: "Gesamt-XP", value: stats.totalXp.toLocaleString("de-DE"), icon: "award", color: "#F0B23E", sub: `Ø ${stats.avgXp} pro Mitglied` },
    { label: "Rollenspiele", value: stats.totalRoleplays, icon: "chat", color: "var(--org-color-1, #4C5DC9)", sub: stats.avgRoleplayScore != null ? `Ø Score ${stats.avgRoleplayScore}` : null },
    { label: "Quiz abgeschlossen", value: stats.totalQuizzes, icon: "book", color: "#00E5C7" },
    { label: "Prüfungen bestanden", value: stats.totalExamsPassed, icon: "award", color: "var(--org-accent, #CE3A5C)" },
    { label: "Community-Beiträge", value: stats.totalPosts, icon: "users", color: "#F0B23E", sub: `${stats.totalComments} Kommentare · ${stats.totalKudos} Kudos` },
    { label: "Anwahlen diese Woche", value: stats.weeklyAnwahlen, icon: "target", color: "var(--org-color-1, #4C5DC9)" },
  ];

  function exportCsv() {
    downloadCsv(
      `Insights-${new Date().toISOString().slice(0, 10)}.csv`,
      ["Name", "XP", "Quiz abgeschlossen", "Prüfungen bestanden", "Rollenspiele", "Ø Rollenspiel-Score", "Aktiv diese Woche", "Registriert am"],
      stats.memberRows.map((r) => [r.name, r.xp, r.quizzesAbgeschlossen, r.pruefungenBestanden, r.rollenspiele, r.rollenspielScoreDurchschnitt, r.aktivDieseWoche, r.registriertAm])
    );
  }

  return (
    <Layout>
      <div className="flex items-start justify-between gap-3 mb-1">
        <h1 className="text-2xl font-display font-medium brand-text-gradient">Insights</h1>
        <button onClick={exportCsv} className="btn-ghost text-xs flex-shrink-0">
          <Icon name="download" size={13} /> Export (CSV)
        </button>
      </div>
      <div className="brand-stripe w-16 mb-4" />
      <p className="text-textMuted text-sm mb-6">Unternehmensweiter Überblick — alle Mitglieder, alle Teams.</p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {tiles.map((t) => (
          <div key={t.label} className="card">
            <div className="flex items-center justify-between mb-2">
              <Icon name={t.icon} color={t.color} size={18} />
            </div>
            <div className="font-display text-2xl font-bold text-textMain">{t.value}</div>
            <div className="text-xs text-textMuted mt-0.5">{t.label}</div>
            {t.sub && <div className="text-[11px] text-textMuted mt-1">{t.sub}</div>}
          </div>
        ))}
      </div>

      <div className="card mb-6">
        <div className="font-semibold text-textMain text-sm mb-1">Meistgenutzte Bereiche</div>
        <p className="text-xs text-textMuted mb-3">Letzte 30 Tage, über alle Mitglieder hinweg.</p>
        <div className="flex flex-col gap-2">
          {stats.usageRanking.map((r, i) => {
            const max = stats.usageRanking[0]?.count || 1;
            return (
              <div key={r.path} className="flex items-center gap-3">
                <span className="w-5 text-center text-xs text-textMuted font-mono flex-shrink-0">{i + 1}</span>
                <span className="text-sm text-textMain w-40 flex-shrink-0 truncate">{r.label}</span>
                <div className="flex-1 h-1.5 bg-line rounded-full overflow-hidden">
                  <div className="h-full brand-gradient" style={{ width: `${(r.count / max) * 100}%` }} />
                </div>
                <span className="text-xs text-textMuted font-mono w-10 text-right flex-shrink-0">{r.count}</span>
              </div>
            );
          })}
          {stats.usageRanking.length === 0 && <p className="text-textMuted text-sm">Noch keine Nutzungsdaten.</p>}
        </div>
      </div>

      <div className="card mb-6">
        <div className="font-semibold text-textMain text-sm mb-3">Kurs-Abschlüsse</div>
        <div className="flex flex-col gap-2.5">
          {COURSES.map((c) => {
            const count = stats.passedByCourse[c.id] || 0;
            const pct = stats.totalMembers ? Math.round((count / stats.totalMembers) * 100) : 0;
            return (
              <div key={c.id}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-textMain">{c.title}</span>
                  <span className="text-textMuted">{count}/{stats.totalMembers} ({pct}%)</span>
                </div>
                <div className="h-1.5 bg-line rounded-full overflow-hidden">
                  <div className="h-full" style={{ width: `${pct}%`, background: c.accent }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {stats.topContributors.length > 0 && (
        <div className="card">
          <div className="font-semibold text-textMain text-sm mb-3">Aktivste Community-Mitglieder (Kudos erhalten)</div>
          <div className="flex flex-col gap-2.5">
            {stats.topContributors.map((c) => (
              <div key={c.id} className="flex items-center gap-3 cursor-pointer" onClick={() => openProfile(c.id)}>
                <Avatar name={c.profile?.full_name || "?"} src={c.profile?.avatar_url} size={30} />
                <span className="text-sm text-textMain flex-1">{c.profile?.full_name || "Unbenannt"}</span>
                <span className="text-xs text-textMuted">{c.count} Kudos</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Layout>
  );
}

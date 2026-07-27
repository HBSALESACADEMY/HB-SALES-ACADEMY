import { useEffect, useState } from "react";
import Layout from "../components/Layout";
import Avatar from "../components/Avatar";
import { supabase } from "../lib/supabaseClient";
import { openProfile } from "../lib/profileModalBus";

const METRIC_LABELS = { roleplay: "Rollenspiele", quiz: "Quiz", daily_challenge: "Tages-Challenges" };
const METRIC_TABLES = { roleplay: "roleplay_sessions", quiz: "quiz_results", daily_challenge: "daily_challenge_completions" };

function mondayOfWeek(d) {
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  const monday = new Date(d);
  monday.setDate(d.getDate() + diff);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

export default function Team() {
  const [selfId, setSelfId] = useState(null);
  const [myProfile, setMyProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [teamStandings, setTeamStandings] = useState([]);
  const [myTeamGoal, setMyTeamGoal] = useState(null);
  const [goalProgress, setGoalProgress] = useState(0);
  const [mentor, setMentor] = useState(null);
  const [mentees, setMentees] = useState([]);
  const [managerName, setManagerName] = useState(null);
  const [leaving, setLeaving] = useState(false);

  async function leaveTeam() {
    if (!confirm("Team wirklich verlassen? Du kannst später jederzeit eine neue Team-Anfrage stellen.")) return;
    setLeaving(true);
    await supabase.from("profiles").update({ manager_id: null }).eq("id", selfId);
    setLeaving(false);
    await load();
  }

  async function load() {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    setSelfId(session.user.id);

    const { data: me } = await supabase.from("profiles").select("*").eq("id", session.user.id).maybeSingle();
    setMyProfile(me);

    const weekStart = mondayOfWeek(new Date()).toISOString();
    const weekStartDateStr = mondayOfWeek(new Date()).toISOString().slice(0, 10);

    const [{ data: allProfiles }, { data: xpRows }] = await Promise.all([
      supabase.from("profiles").select("id, full_name, manager_id, role, team_name").eq("status", "approved"),
      supabase.from("xp_log").select("user_id, amount").gt("created_at", weekStart),
    ]);

    const managers = (allProfiles || []).filter((p) => p.role === "manager");
    const xpByUser = {};
    (xpRows || []).forEach((r) => { xpByUser[r.user_id] = (xpByUser[r.user_id] || 0) + r.amount; });

    const standings = managers.map((mgr) => {
      const teamMemberIds = (allProfiles || []).filter((p) => p.manager_id === mgr.id).map((p) => p.id);
      const allIds = [mgr.id, ...teamMemberIds];
      const totalXp = allIds.reduce((sum, id) => sum + (xpByUser[id] || 0), 0);
      return { managerId: mgr.id, managerName: mgr.team_name || `Team von ${mgr.full_name || "?"}`, memberCount: teamMemberIds.length, weeklyXp: totalXp };
    }).sort((a, b) => b.weeklyXp - a.weeklyXp);
    setTeamStandings(standings);

    if (me?.manager_id) {
      const { data: mgr } = await supabase.from("profiles").select("full_name, team_name").eq("id", me.manager_id).maybeSingle();
      setManagerName(mgr?.team_name || (mgr?.full_name ? `Team von ${mgr.full_name}` : null));

      const [{ data: goal }, { data: pair }, { data: myMentees }] = await Promise.all([
        supabase.from("team_goals").select("*").eq("manager_id", me.manager_id).eq("week_start", weekStartDateStr).order("created_at", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("mentor_pairs").select("*, mentor:mentor_id(full_name, avatar_url)").eq("mentee_id", session.user.id).eq("active", true).maybeSingle(),
        supabase.from("mentor_pairs").select("*, mentee:mentee_id(full_name, avatar_url)").eq("mentor_id", session.user.id).eq("active", true),
      ]);
      setMentor(pair);
      setMentees(myMentees || []);

      if (goal) {
        setMyTeamGoal(goal);
        const teamMemberIds = (allProfiles || []).filter((p) => p.manager_id === me.manager_id).map((p) => p.id);
        const allIds = [me.manager_id, ...teamMemberIds];
        const table = METRIC_TABLES[goal.metric];
        const { count } = await supabase.from(table).select("id", { count: "exact", head: true }).in("user_id", allIds).gte("created_at", weekStart);
        setGoalProgress(count || 0);
      }
    }

    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  if (loading) return <Layout><p className="text-textMuted text-sm">Lädt...</p></Layout>;

  return (
    <Layout>
      <h1 className="text-2xl font-display font-bold brand-text-gradient mb-1">Mein Team</h1>
      <div className="brand-stripe w-16 mb-3" />
      <div className="flex items-center justify-between mb-6">
        <p className="text-textMuted text-sm">{managerName ? managerName : "Wettbewerb, Ziele und Mentoring für dein Team."}</p>
        {managerName && (
          <button disabled={leaving} onClick={leaveTeam} className="btn-ghost text-xs text-coral border-coral/40 disabled:opacity-40 flex-shrink-0">
            {leaving ? "..." : "Team verlassen"}
          </button>
        )}
      </div>

      {myTeamGoal && (
        <div className="card mb-5">
          <div className="flex items-center justify-between mb-2">
            <div className="font-semibold text-white text-sm">🎯 Team-Ziel dieser Woche: {myTeamGoal.title}</div>
            <span className="text-xs text-textMuted">{goalProgress}/{myTeamGoal.target_count} {METRIC_LABELS[myTeamGoal.metric]}</span>
          </div>
          <div className="h-2.5 bg-line rounded-full overflow-hidden">
            <div className="h-full brand-gradient transition-all" style={{ width: `${Math.min(100, (goalProgress / myTeamGoal.target_count) * 100)}%` }} />
          </div>
        </div>
      )}

      <div className="card mb-5">
        <div className="font-semibold text-white text-sm mb-3">🏆 Team-Wettbewerb dieser Woche</div>
        <div className="flex flex-col gap-2">
          {teamStandings.map((t, i) => {
            const isMyTeam = t.managerId === myProfile?.manager_id;
            return (
              <div key={t.managerId} className={`flex items-center gap-3 px-3 py-2 rounded-lg ${isMyTeam ? "bg-surfaceRaised border border-amber/30" : ""}`}>
                <span className="w-6 text-center text-sm text-textMuted font-mono">{i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}</span>
                <span className="flex-1 text-sm text-white">{t.managerName}{isMyTeam && <span className="text-amber"> (dein Team)</span>} <span className="text-textMuted text-xs">· {t.memberCount + 1} Mitglieder</span></span>
                <span className="font-mono text-sm text-white">{t.weeklyXp} XP</span>
              </div>
            );
          })}
          {teamStandings.length === 0 && <p className="text-textMuted text-sm">Noch keine Teams vorhanden.</p>}
        </div>
      </div>

      {(mentor || mentees.length > 0) && (
        <div className="card">
          <div className="font-semibold text-white text-sm mb-3">🤝 Mentoring</div>
          {mentor && (
            <div className="flex items-center gap-3 mb-2 cursor-pointer" onClick={() => openProfile(mentor.mentor_id)}>
              <Avatar name={mentor.mentor?.full_name || "?"} src={mentor.mentor?.avatar_url} size={32} />
              <div className="text-sm"><span className="text-textMuted">Dein Mentor: </span><span className="text-white font-medium">{mentor.mentor?.full_name}</span></div>
            </div>
          )}
          {mentees.map((m) => (
            <div key={m.id} className="flex items-center gap-3 cursor-pointer" onClick={() => openProfile(m.mentee_id)}>
              <Avatar name={m.mentee?.full_name || "?"} src={m.mentee?.avatar_url} size={32} />
              <div className="text-sm"><span className="text-textMuted">Du bist Mentor für: </span><span className="text-white font-medium">{m.mentee?.full_name}</span></div>
            </div>
          ))}
        </div>
      )}
    </Layout>
  );
}

import { useEffect, useState } from "react";
import Layout from "../components/Layout";
import Avatar from "../components/Avatar";
import { supabase } from "../lib/supabaseClient";
import { openProfile } from "../lib/profileModalBus";
import { apiGet } from "../lib/apiClient";
import { goalMetricLabel } from "../lib/goalMetrics";

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
  const [loading, setLoading] = useState(true);
  const [teamStandings, setTeamStandings] = useState([]);
  const [myTeams, setMyTeams] = useState([]);
  const [leavingId, setLeavingId] = useState(null);
  const [mentor, setMentor] = useState(null);
  const [mentees, setMentees] = useState([]);

  async function leaveTeam(teamId) {
    if (!confirm("Team wirklich verlassen? Du kannst später jederzeit eine neue Team-Anfrage stellen.")) return;
    setLeavingId(teamId);
    const { error } = await supabase.from("team_members").delete().eq("team_id", teamId).eq("user_id", selfId);
    setLeavingId(null);
    if (error) { alert(error.message); return; }
    await load();
  }

  async function load() {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    setSelfId(session.user.id);

    const weekStart = mondayOfWeek(new Date()).toISOString();

    const [{ data: allTeams }, { data: allMemberships }, { data: xpRows }, { data: myMemberships }] = await Promise.all([
      supabase.from("teams").select("id, name, created_by"),
      supabase.from("team_members").select("team_id, user_id"),
      supabase.from("xp_log").select("user_id, amount").gt("created_at", weekStart),
      supabase.from("team_members").select("team_id").eq("user_id", session.user.id),
    ]);

    const xpByUser = {};
    (xpRows || []).forEach((r) => { xpByUser[r.user_id] = (xpByUser[r.user_id] || 0) + r.amount; });

    const membersByTeam = {};
    (allMemberships || []).forEach((m) => { (membersByTeam[m.team_id] = membersByTeam[m.team_id] || []).push(m.user_id); });

    const standings = (allTeams || []).map((t) => {
      const memberIds = membersByTeam[t.id] || [];
      const totalXp = memberIds.reduce((sum, id) => sum + (xpByUser[id] || 0), 0);
      return { teamId: t.id, teamName: t.name, memberCount: memberIds.length, weeklyXp: totalXp };
    }).sort((a, b) => b.weeklyXp - a.weeklyXp);
    setTeamStandings(standings);

    const myTeamIds = (myMemberships || []).map((m) => m.team_id);
    const leadById = {};
    (allTeams || []).forEach((t) => { leadById[t.id] = t.created_by; });
    const leadIds = Array.from(new Set(myTeamIds.map((id) => leadById[id]).filter(Boolean)));
    const { data: leadProfiles } = leadIds.length
      ? await supabase.from("profiles").select("id, full_name").in("id", leadIds)
      : { data: [] };
    const leadNameById = {};
    (leadProfiles || []).forEach((p) => { leadNameById[p.id] = p.full_name || "Unbenannt"; });

    // Ziele samt Fortschritt kommen gesammelt vom Server (siehe
    // pages/api/team-goals.js): die Anruf-Zahlen der anderen Teammitglieder
    // darf der Browser gar nicht lesen, die Summe wäre hier zu niedrig.
    let zieleProTeam = {};
    try {
      const { ziele } = await apiGet("/api/team-goals");
      (ziele || []).forEach((z) => {
        if (!zieleProTeam[z.team_id]) zieleProTeam[z.team_id] = [];
        zieleProTeam[z.team_id].push(z);
      });
    } catch (e) {
      // Ohne Ziele bleibt die Seite nutzbar — der Rest hängt nicht daran.
      console.error("Team-Ziele konnten nicht geladen werden:", e.message);
    }

    const enrichedTeams = myTeamIds.map((tid) => {
      const t = (allTeams || []).find((x) => x.id === tid);
      return {
        id: tid, name: t?.name || "Team",
        isLead: t?.created_by === session.user.id,
        leadName: leadNameById[t?.created_by] || null,
        ziele: zieleProTeam[tid] || [],
      };
    });
    setMyTeams(enrichedTeams);

    const [{ data: pair }, { data: myMentees }] = await Promise.all([
      supabase.from("mentor_pairs").select("*, mentor:mentor_id(full_name, avatar_url)").eq("mentee_id", session.user.id).eq("active", true).maybeSingle(),
      supabase.from("mentor_pairs").select("*, mentee:mentee_id(full_name, avatar_url)").eq("mentor_id", session.user.id).eq("active", true),
    ]);
    setMentor(pair);
    setMentees(myMentees || []);

    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  if (loading) return <Layout><p className="text-textMuted text-sm">Lädt...</p></Layout>;

  const myTeamIdSet = new Set(myTeams.map((t) => t.id));

  return (
    <Layout>
      <h1 className="text-2xl font-display font-medium brand-text-gradient mb-1">Mein Team</h1>
      <div className="brand-stripe w-16 mb-4" />
      <p className="text-textMuted text-sm mb-6">Wettbewerb, Ziele und Mentoring für deine Teams.</p>

      {myTeams.length > 0 && (
        <div className="flex flex-col gap-3 mb-5">
          {myTeams.map((t) => (
            <div key={t.id} className="card">
              <div className="flex items-center justify-between mb-2">
                <div className="font-semibold text-textMain text-sm">{t.name}{t.isLead && <span className="text-amber"> (du leitest dieses Team)</span>}</div>
                {!t.isLead && (
                  <button disabled={leavingId === t.id} onClick={() => leaveTeam(t.id)} className="btn-ghost text-xs text-coral border-coral/40 disabled:opacity-40 flex-shrink-0">
                    {leavingId === t.id ? "..." : "Team verlassen"}
                  </button>
                )}
              </div>
              {!t.isLead && t.leadName && <div className="text-xs text-textMuted mb-2">Lead: {t.leadName}</div>}
              {t.ziele.map((z) => (
                <div key={z.id} className="mb-2 last:mb-0">
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <span className="text-xs text-textMuted min-w-0 truncate">🎯 {z.title}</span>
                    <span className="text-xs text-textMuted flex-shrink-0">{z.fortschritt}/{z.target_count} {goalMetricLabel(z.metric)}</span>
                  </div>
                  <div className="h-2 bg-line rounded-full overflow-hidden">
                    <div className="h-full brand-gradient transition-all" style={{ width: `${Math.min(100, (z.fortschritt / z.target_count) * 100)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      <div className="card mb-5">
        <div className="font-semibold text-textMain text-sm mb-3">🏆 Team-Wettbewerb dieser Woche</div>
        <div className="flex flex-col gap-2">
          {teamStandings.map((t, i) => {
            const isMyTeam = myTeamIdSet.has(t.teamId);
            return (
              <div key={t.teamId} className={`flex items-center gap-3 px-3 py-2 rounded-lg ${isMyTeam ? "bg-surfaceRaised border border-amber/30" : ""}`}>
                <span className="w-6 text-center text-sm text-textMuted font-mono">{i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}</span>
                <span className="flex-1 text-sm text-textMain">{t.teamName}{isMyTeam && <span className="text-amber"> (dein Team)</span>} <span className="text-textMuted text-xs">· {t.memberCount} Mitglieder</span></span>
                <span className="font-mono text-sm text-textMain">{t.weeklyXp} XP</span>
              </div>
            );
          })}
          {teamStandings.length === 0 && <p className="text-textMuted text-sm">Noch keine Teams vorhanden.</p>}
        </div>
      </div>

      {(mentor || mentees.length > 0) && (
        <div className="card">
          <div className="font-semibold text-textMain text-sm mb-3">🤝 Mentoring</div>
          {mentor && (
            <div className="flex items-center gap-3 mb-2 cursor-pointer" onClick={() => openProfile(mentor.mentor_id)}>
              <Avatar name={mentor.mentor?.full_name || "?"} src={mentor.mentor?.avatar_url} size={32} />
              <div className="text-sm"><span className="text-textMuted">Dein Mentor: </span><span className="text-textMain font-medium">{mentor.mentor?.full_name}</span></div>
            </div>
          )}
          {mentees.map((m) => (
            <div key={m.id} className="flex items-center gap-3 cursor-pointer" onClick={() => openProfile(m.mentee_id)}>
              <Avatar name={m.mentee?.full_name || "?"} src={m.mentee?.avatar_url} size={32} />
              <div className="text-sm"><span className="text-textMuted">Du bist Mentor für: </span><span className="text-textMain font-medium">{m.mentee?.full_name}</span></div>
            </div>
          ))}
        </div>
      )}
    </Layout>
  );
}

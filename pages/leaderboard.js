import { useEffect, useState } from "react";
import Layout from "../components/Layout";
import Icon from "../components/Icon";
import Avatar from "../components/Avatar";
import { supabase } from "../lib/supabaseClient";
import { openProfile } from "../lib/profileModalBus";
import { getActiveOrgId } from "../lib/activeOrg";

function rangeStart(range) {
  const d = new Date();
  // Woche über lib/woche.js — sonst beginnt sie je nach Zeitzone des Geräts
  // an einem anderen Tag als bei den Team-Zielen.
  if (range === "week") {
    return wochenStartZeitpunkt();
  } else if (range === "month") {
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
  } else {
    return null;
  }
  return d.toISOString();
}

export default function Leaderboard() {
  const [rows, setRows] = useState([]);
  const [teamRows, setTeamRows] = useState([]);
  const [selfId, setSelfId] = useState(null);
  const [friendIds, setFriendIds] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState("all"); // 'week' | 'month' | 'all'
  const [mode, setMode] = useState("individual"); // 'individual' | 'teams'

  async function load() {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (session) setSelfId(session.user.id);

    // profiles ist RLS-seitig bewusst organisationsübergreifend lesbar (für
    // die globale Personensuche/Community) — die Rangliste braucht aber
    // explizit nur die EIGENE Organisation, sonst tauchen fremde Firmen
    // im "unternehmensweiten" Ranking auf.
    let activeOrgId = null;
    if (session) {
      const { data: me } = await supabase.from("profiles").select("organization_id, is_platform_admin").eq("id", session.user.id).maybeSingle();
      activeOrgId = getActiveOrgId(me);
    }

    const [{ data: profiles }, { data: friendships }] = await Promise.all([
      // Großzügige Obergrenze — verhindert unbegrenztes Wachstum, ohne bei
      // realistischen Organisationsgrößen die Rangliste zu verfälschen.
      activeOrgId
        ? supabase.from("profiles").select("id, full_name, xp, avatar_url").eq("status", "approved").eq("leaderboard_opt_out", false).eq("organization_id", activeOrgId).order("xp", { ascending: false }).limit(500)
        : Promise.resolve({ data: [] }),
      session ? supabase.from("friendships").select("*").eq("status", "accepted").or(`requester_id.eq.${session.user.id},addressee_id.eq.${session.user.id}`) : Promise.resolve({ data: [] }),
    ]);

    setFriendIds(new Set((friendships || []).map((f) => f.requester_id === session?.user.id ? f.addressee_id : f.requester_id)));

    const since = rangeStart(range);
    let xpByUser = {};
    if (since) {
      const { data: xpRows } = await supabase.from("xp_log").select("user_id, amount").gt("created_at", since);
      (xpRows || []).forEach((r) => { xpByUser[r.user_id] = (xpByUser[r.user_id] || 0) + r.amount; });
    } else {
      (profiles || []).forEach((p) => { xpByUser[p.id] = p.xp || 0; });
    }

    const result = (profiles || [])
      .map((p) => ({ ...p, xp: xpByUser[p.id] || 0 }))
      .filter((p) => !since || p.xp > 0);
    result.sort((a, b) => (b.xp || 0) - (a.xp || 0));
    setRows(result.slice(0, 50));

    // Team-Ranking: Gesamt-XP der Mitglieder je Team (im gewählten Zeitraum).
    // Ist jemand in mehreren Teams, zählt er/sie in jedem davon — Teams sind
    // hier bewusst als eigene, sich ggf. überschneidende Gruppen behandelt.
    const [{ data: teams }, { data: teamMembers }] = await Promise.all([
      supabase.from("teams").select("id, name").limit(200),
      supabase.from("team_members").select("team_id, user_id").limit(2000),
    ]);
    const membersByTeam = {};
    (teamMembers || []).forEach((m) => { membersByTeam[m.team_id] = membersByTeam[m.team_id] || []; membersByTeam[m.team_id].push(m.user_id); });
    const teamResult = (teams || [])
      .map((t) => {
        const memberIds = membersByTeam[t.id] || [];
        const totalXp = memberIds.reduce((s, uid) => s + (xpByUser[uid] || 0), 0);
        return { ...t, memberCount: memberIds.length, xp: totalXp };
      })
      .filter((t) => t.memberCount > 0 && (!since || t.xp > 0))
      .sort((a, b) => b.xp - a.xp);
    setTeamRows(teamResult);

    setLoading(false);
  }

  useEffect(() => { load(); }, [range]);

  return (
    <Layout>
      <h1 className="text-2xl font-display font-medium brand-text-gradient mb-1">Rangliste</h1>
      <div className="brand-stripe w-16 mb-4" />
      <p className="text-textMuted text-sm mb-5">XP-Ranking über das ganze Team.</p>

      <div className="flex items-center justify-between gap-2 mb-5 flex-wrap">
        <div className="flex items-center gap-2">
          {[["week", "Diese Woche"], ["month", "Dieser Monat"], ["all", "Allzeit"]].map(([key, label]) => (
            <button key={key} onClick={() => setRange(key)} className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${range === key ? "bg-amber text-[var(--org-button-text,#fff)] border-amber" : "border-line text-textMuted hover:text-textMain"}`}>
              {label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {[["individual", "Einzeln"], ["teams", "Teams"]].map(([key, label]) => (
            <button key={key} onClick={() => setMode(key)} className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${mode === key ? "bg-violet text-[var(--org-button-text,#fff)] border-violet" : "border-line text-textMuted hover:text-textMain"}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="text-textMuted text-sm">Lädt...</p>
      ) : mode === "teams" ? (
        <div className="flex flex-col gap-2">
          {teamRows.map((t, i) => {
            const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : null;
            return (
              <div key={t.id} className="card flex items-center gap-3.5">
                <span className="w-7 text-center font-mono text-sm text-textMuted flex-shrink-0">{medal || i + 1}</span>
                <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 bg-surfaceRaised text-violet">
                  <Icon name="users" size={16} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-textMain text-sm truncate">{t.name}</div>
                  <div className="text-[11px] text-textMuted">{t.memberCount} Mitglied{t.memberCount === 1 ? "" : "er"}</div>
                </div>
                <span className="flex items-center gap-1 font-mono text-sm text-textMain flex-shrink-0"><Icon name="flame" size={13} color="var(--org-accent, #CE3A5C)" /> {t.xp} XP</span>
              </div>
            );
          })}
          {teamRows.length === 0 && <p className="text-textMuted text-sm">Noch keine Teams mit Mitgliedern für diesen Zeitraum.</p>}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {rows.map((r, i) => {
            const level = Math.floor((r.xp || 0) / 150) + 1;
            const isSelf = r.id === selfId;
            const isFriend = friendIds.has(r.id);
            const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : null;
            return (
              <div key={r.id} className={`card flex items-center gap-3.5 ${isSelf ? "border border-amber/40" : isFriend ? "border border-violet/30" : ""}`}>
                <span className="w-7 text-center font-mono text-sm text-textMuted flex-shrink-0">{medal || i + 1}</span>
                <button onClick={() => openProfile(r.id)} className="flex items-center gap-3 flex-1 min-w-0 text-left hover:opacity-80">
                  <Avatar name={r.full_name || "?"} src={r.avatar_url} size={32} />
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-textMain text-sm truncate flex items-center gap-1.5">
                      {r.full_name || "Unbenannt"}{isSelf && <span className="text-amber"> (Du)</span>}
                      {isFriend && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-violet/15 text-violet font-semibold">Freund</span>}
                    </div>
                    {range === "all" && <div className="text-[11px] text-textMuted">Level {level}</div>}
                  </div>
                </button>
                <span className="flex items-center gap-1 font-mono text-sm text-textMain flex-shrink-0"><Icon name="flame" size={13} color="var(--org-accent, #CE3A5C)" /> {r.xp || 0} XP</span>
              </div>
            );
          })}
          {rows.length === 0 && <p className="text-textMuted text-sm">Noch keine Daten für diesen Zeitraum.</p>}
        </div>
      )}
    </Layout>
  );
}

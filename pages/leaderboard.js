import { useEffect, useState } from "react";
import Layout from "../components/Layout";
import Icon from "../components/Icon";
import Avatar from "../components/Avatar";
import { supabase } from "../lib/supabaseClient";
import { openProfile } from "../lib/profileModalBus";

function rangeStart(range) {
  const d = new Date();
  if (range === "week") {
    const day = d.getDay();
    const diff = (day === 0 ? -6 : 1) - day;
    d.setDate(d.getDate() + diff);
    d.setHours(0, 0, 0, 0);
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
  const [selfId, setSelfId] = useState(null);
  const [friendIds, setFriendIds] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState("all"); // 'week' | 'month' | 'all'

  async function load() {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (session) setSelfId(session.user.id);

    const [{ data: profiles }, { data: friendships }] = await Promise.all([
      supabase.from("profiles").select("id, full_name, xp, avatar_url").eq("status", "approved").eq("leaderboard_opt_out", false),
      session ? supabase.from("friendships").select("*").eq("status", "accepted").or(`requester_id.eq.${session.user.id},addressee_id.eq.${session.user.id}`) : Promise.resolve({ data: [] }),
    ]);

    setFriendIds(new Set((friendships || []).map((f) => f.requester_id === session?.user.id ? f.addressee_id : f.requester_id)));

    let result;
    const since = rangeStart(range);
    if (since) {
      const { data: xpRows } = await supabase.from("xp_log").select("user_id, amount").gt("created_at", since);
      const totals = {};
      (xpRows || []).forEach((r) => { totals[r.user_id] = (totals[r.user_id] || 0) + r.amount; });
      result = (profiles || []).map((p) => ({ ...p, xp: totals[p.id] || 0 })).filter((p) => p.xp > 0);
    } else {
      result = profiles || [];
    }
    result.sort((a, b) => (b.xp || 0) - (a.xp || 0));
    setRows(result.slice(0, 50));
    setLoading(false);
  }

  useEffect(() => { load(); }, [range]);

  return (
    <Layout>
      <h1 className="text-2xl font-display font-bold brand-text-gradient mb-1">Rangliste</h1>
      <div className="brand-stripe w-16 mb-4" />
      <p className="text-textMuted text-sm mb-5">XP-Ranking über das ganze Team.</p>

      <div className="flex items-center gap-2 mb-5">
        {[["week", "Diese Woche"], ["month", "Dieser Monat"], ["all", "Allzeit"]].map(([key, label]) => (
          <button key={key} onClick={() => setRange(key)} className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${range === key ? "bg-amber text-white border-amber" : "border-line text-textMuted hover:text-white"}`}>
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-textMuted text-sm">Lädt...</p>
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
                    <div className="font-semibold text-white text-sm truncate flex items-center gap-1.5">
                      {r.full_name || "Unbenannt"}{isSelf && <span className="text-amber"> (Du)</span>}
                      {isFriend && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-violet/15 text-violet font-semibold">Freund</span>}
                    </div>
                    {range === "all" && <div className="text-[11px] text-textMuted">Level {level}</div>}
                  </div>
                </button>
                <span className="flex items-center gap-1 font-mono text-sm text-white flex-shrink-0"><Icon name="flame" size={13} color="#E8368F" /> {r.xp || 0} XP</span>
              </div>
            );
          })}
          {rows.length === 0 && <p className="text-textMuted text-sm">Noch keine Daten für diesen Zeitraum.</p>}
        </div>
      )}
    </Layout>
  );
}

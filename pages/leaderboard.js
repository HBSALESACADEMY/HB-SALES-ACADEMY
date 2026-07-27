import { useEffect, useState } from "react";
import Layout from "../components/Layout";
import Icon from "../components/Icon";
import Avatar from "../components/Avatar";
import { supabase } from "../lib/supabaseClient";
import { openProfile } from "../lib/profileModalBus";

export default function Leaderboard() {
  const [rows, setRows] = useState([]);
  const [selfId, setSelfId] = useState(null);
  const [friendIds, setFriendIds] = useState(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) setSelfId(session.user.id);
      const [{ data }, { data: friendships }] = await Promise.all([
        supabase.from("profiles").select("id, full_name, xp, avatar_url").eq("status", "approved").order("xp", { ascending: false }).limit(50),
        session ? supabase.from("friendships").select("*").eq("status", "accepted").or(`requester_id.eq.${session.user.id},addressee_id.eq.${session.user.id}`) : Promise.resolve({ data: [] }),
      ]);
      setRows(data || []);
      const ids = new Set((friendships || []).map((f) => f.requester_id === session?.user.id ? f.addressee_id : f.requester_id));
      setFriendIds(ids);
      setLoading(false);
    }
    load();
  }, []);

  return (
    <Layout>
      <h1 className="text-2xl font-display text-white mb-1">Rangliste</h1>
      <p className="text-textMuted text-sm mb-6">XP-Ranking über das ganze Team.</p>
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
                    <div className="text-[11px] text-textMuted">Level {level}</div>
                  </div>
                </button>
                <span className="flex items-center gap-1 font-mono text-sm text-white flex-shrink-0"><Icon name="flame" size={13} color="#E8368F" /> {r.xp || 0} XP</span>
              </div>
            );
          })}
          {rows.length === 0 && <p className="text-textMuted text-sm">Noch keine Daten.</p>}
        </div>
      )}
    </Layout>
  );
}

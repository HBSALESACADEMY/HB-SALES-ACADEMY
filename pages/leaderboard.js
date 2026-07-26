import { useEffect, useState } from "react";
import Layout from "../components/Layout";
import Icon from "../components/Icon";
import Avatar from "../components/Avatar";
import { supabase } from "../lib/supabaseClient";

export default function Leaderboard() {
  const [rows, setRows] = useState([]);
  const [selfId, setSelfId] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) setSelfId(session.user.id);
      const { data } = await supabase.from("profiles").select("id, full_name, xp").eq("status", "approved").order("xp", { ascending: false }).limit(50);
      setRows(data || []);
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
            const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : null;
            return (
              <div key={r.id} className={`card flex items-center gap-3.5 ${isSelf ? "border border-amber/40" : ""}`}>
                <span className="w-7 text-center font-mono text-sm text-textMuted flex-shrink-0">{medal || i + 1}</span>
                <Avatar name={r.full_name || "?"} size={32} />
                <div className="flex-1">
                  <div className="font-semibold text-white text-sm">{r.full_name || "Unbenannt"}{isSelf && <span className="text-amber"> (Du)</span>}</div>
                  <div className="text-[11px] text-textMuted">Level {level}</div>
                </div>
                <span className="flex items-center gap-1 font-mono text-sm text-white flex-shrink-0"><Icon name="flame" size={13} color="#F0B23E" /> {r.xp || 0} XP</span>
              </div>
            );
          })}
          {rows.length === 0 && <p className="text-textMuted text-sm">Noch keine Daten.</p>}
        </div>
      )}
    </Layout>
  );
}

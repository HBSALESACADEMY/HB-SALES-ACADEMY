import { useEffect, useState } from "react";
import Layout from "../../components/Layout";
import Avatar from "../../components/Avatar";
import { supabase } from "../../lib/supabaseClient";
import { openProfile } from "../../lib/profileModalBus";

const FIELD_LABELS = [
  { key: "anwahlen", label: "Anwahlen" },
  { key: "erreicht", label: "Erreicht" },
  { key: "nicht", label: "Nicht erreicht" },
  { key: "termin", label: "Termine" },
  { key: "positiv", label: "Positiv" },
  { key: "negativ", label: "Negativ" },
];

export default function CallStats() {
  const [access, setAccess] = useState(null);
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [rangeDays, setRangeDays] = useState(7);

  async function load() {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const { data: me } = await supabase.from("profiles").select("*").eq("id", session.user.id).maybeSingle();
    if (me?.is_admin) setAccess("admin");
    else if (me?.role === "manager") setAccess("manager");
    else { setAccess(null); setLoading(false); return; }

    const since = new Date(Date.now() - rangeDays * 86400000).toISOString().slice(0, 10);
    const today = new Date().toISOString().slice(0, 10);

    let relevantIds = null;
    if (me.role === "manager" && !me.is_admin) {
      const { data: team } = await supabase.from("profiles").select("id").eq("manager_id", session.user.id);
      relevantIds = [session.user.id, ...(team || []).map((t) => t.id)];
    }

    const { data: profiles } = await supabase.from("profiles").select("id, full_name, avatar_url").eq("status", "approved");
    const pMap = {};
    (profiles || []).forEach((p) => { pMap[p.id] = p; });

    let query = supabase.from("call_log_days").select("*").gte("log_date", since);
    if (relevantIds) query = query.in("user_id", relevantIds);
    const { data: logs } = await query;

    const byUser = {};
    (logs || []).forEach((l) => {
      byUser[l.user_id] = byUser[l.user_id] || { total: {}, today: {} };
      FIELD_LABELS.forEach((f) => {
        byUser[l.user_id].total[f.key] = (byUser[l.user_id].total[f.key] || 0) + (l.counts?.[f.key] || 0);
      });
      if (l.log_date === today) byUser[l.user_id].today = l.counts || {};
    });

    const result = Object.entries(byUser).map(([userId, data]) => ({
      userId, name: pMap[userId]?.full_name || "Unbenannt", avatar: pMap[userId]?.avatar_url, ...data,
    })).sort((a, b) => (b.total.anwahlen || 0) - (a.total.anwahlen || 0));

    setRows(result);
    setLoading(false);
  }

  useEffect(() => { load(); }, [rangeDays]);

  if (loading) return <Layout><p className="text-textMuted text-sm">Lädt...</p></Layout>;

  if (!access) {
    return (
      <Layout>
        <h1 className="text-2xl font-display text-white mb-1">Call-Tracker-Auswertung</h1>
        <p className="text-textMuted text-sm">Diese Ansicht ist nur für Manager und Admin-Konten verfügbar.</p>
      </Layout>
    );
  }

  return (
    <Layout>
      <h1 className="text-2xl font-display font-bold brand-text-gradient mb-1">Call-Tracker-Auswertung</h1>
      <div className="brand-stripe w-16 mb-3" />
      <p className="text-textMuted text-sm mb-5">
        {access === "admin" ? "Alle Mitglieder, unternehmensweit." : "Dein Team."} Anwahlversuche und Ergebnisse im Überblick.
      </p>

      <div className="flex items-center gap-2 mb-5">
        {[7, 14, 30].map((d) => (
          <button key={d} onClick={() => setRangeDays(d)} className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${rangeDays === d ? "bg-amber text-white border-amber" : "border-line text-textMuted hover:text-white"}`}>
            {d} Tage
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-3">
        {rows.map((r) => (
          <div key={r.userId} className="card">
            <div className="flex items-center gap-3 mb-3">
              <button onClick={() => openProfile(r.userId)}><Avatar name={r.name} src={r.avatar} size={32} /></button>
              <span className="font-semibold text-white text-sm flex-1 cursor-pointer hover:underline" onClick={() => openProfile(r.userId)}>{r.name}</span>
              <span className="text-xs text-textMuted">Heute: {r.today.anwahlen || 0} Anwahlen</span>
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
              {FIELD_LABELS.map((f) => (
                <div key={f.key} className="text-center">
                  <div className="font-mono text-sm text-white">{r.total[f.key] || 0}</div>
                  <div className="text-[10px] text-textMuted">{f.label}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
        {rows.length === 0 && <p className="text-textMuted text-sm">Noch keine Call-Tracker-Daten in diesem Zeitraum.</p>}
      </div>
    </Layout>
  );
}

import { useEffect, useState } from "react";
import Layout from "../components/Layout";
import Avatar from "../components/Avatar";
import { supabase } from "../lib/supabaseClient";
import { openProfile } from "../lib/profileModalBus";

export default function Kunden() {
  const [loading, setLoading] = useState(true);
  const [canSeeTeam, setCanSeeTeam] = useState(false);
  const [viewMode, setViewMode] = useState("own"); // 'own' | 'team'
  const [customers, setCustomers] = useState([]);
  const [profileMap, setProfileMap] = useState({});
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const { data: me } = await supabase.from("profiles").select("role, is_admin, is_platform_admin").eq("id", session.user.id).maybeSingle();
    const canManage = !!(me?.role === "manager" || me?.role === "backend" || me?.is_admin || me?.is_platform_admin);
    setCanSeeTeam(canManage);
    if (me?.role === "backend" && viewMode === "own") { setViewMode("team"); return; }

    let query = supabase.from("leads").select("*").eq("outcome", "kunde").order("created_at", { ascending: false });
    if (!(canManage && viewMode === "team")) query = query.eq("created_by", session.user.id);
    const { data: rows, error: err } = await query;
    if (err) setError(err.message);
    setCustomers(rows || []);

    if (canManage && viewMode === "team") {
      const creatorIds = [...new Set((rows || []).map((l) => l.created_by))];
      if (creatorIds.length) {
        const { data: profiles } = await supabase.from("profiles").select("id, full_name, avatar_url").in("id", creatorIds);
        const map = {};
        (profiles || []).forEach((p) => { map[p.id] = p; });
        setProfileMap(map);
      }
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
    const interval = setInterval(load, 20000);
    return () => clearInterval(interval);
  }, [viewMode]);

  if (loading) return <Layout><p className="text-textMuted text-sm">Lädt...</p></Layout>;

  return (
    <Layout>
      <h1 className="text-2xl font-display font-bold brand-text-gradient mb-1">Kunden</h1>
      <div className="brand-stripe w-16 mb-4" />
      <p className="text-textMuted text-sm mb-5">Termine, die zu einem Kunden geworden sind.</p>

      {canSeeTeam && (
        <div className="flex items-center gap-2 mb-5">
          {[["own", "Meine"], ["team", "Alle im Team"]].map(([key, label]) => (
            <button key={key} onClick={() => setViewMode(key)} className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${viewMode === key ? "bg-amber text-[var(--org-button-text,#fff)] border-amber" : "border-line text-textMuted hover:text-textMain"}`}>
              {label}
            </button>
          ))}
        </div>
      )}

      {error && <div className="card border border-coral/40 text-coral text-sm mb-4">{error}</div>}

      <div className="flex flex-col gap-3">
        {customers.map((c) => {
          const owner = profileMap[c.created_by];
          return (
            <div key={c.id} className="card">
              <div className="flex items-start justify-between gap-3 mb-2 flex-wrap">
                <div className="min-w-0">
                  <div className="font-display font-semibold text-textMain">{c.name}</div>
                  <div className="text-xs text-textMuted mt-0.5">{c.company || "Kein Unternehmen angegeben"}</div>
                </div>
                <span className="text-[10px] uppercase tracking-wide text-teal border border-teal/40 rounded px-1.5 py-0.5 flex-shrink-0">Kunde</span>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-textMuted">
                {c.phone && <span>📞 {c.phone}</span>}
                {c.email && <span>✉️ {c.email}</span>}
                {c.website && <span>🌐 {c.website}</span>}
                {viewMode === "team" && owner && (
                  <button onClick={() => openProfile(owner.id)} className="flex items-center gap-1.5 hover:text-textMain">
                    <Avatar name={owner.full_name || "?"} src={owner.avatar_url} size={16} /> {owner.full_name || "Unbenannt"}
                  </button>
                )}
              </div>
              {c.notes && <p className="text-sm text-textMain mt-2">{c.notes}</p>}
            </div>
          );
        })}
        {customers.length === 0 && <p className="text-textMuted text-sm">Noch keine Kunden — markiere einen Termin unter "Termine" als "Kunde geworden".</p>}
      </div>
    </Layout>
  );
}

import { useEffect, useState } from "react";
import Layout from "../../components/Layout";
import Avatar from "../../components/Avatar";
import { supabase } from "../../lib/supabaseClient";
import { openProfile } from "../../lib/profileModalBus";

export default function AdminLogins() {
  const [isManager, setIsManager] = useState(true);
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState([]);
  const [profileMap, setProfileMap] = useState({});
  const [filterUser, setFilterUser] = useState("");

  async function load() {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const { data: me } = await supabase.from("profiles").select("role").eq("id", session.user.id).maybeSingle();
    if (!me || me.role !== "manager") { setIsManager(false); setLoading(false); return; }

    const [{ data: ev }, { data: profiles }] = await Promise.all([
      supabase.from("login_events").select("*").order("created_at", { ascending: false }).limit(300),
      supabase.from("profiles").select("id, full_name, avatar_url"),
    ]);
    const map = {};
    (profiles || []).forEach((p) => { map[p.id] = p; });
    setProfileMap(map);
    setEvents(ev || []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  if (loading) return <Layout><p className="text-textMuted text-sm">Lädt...</p></Layout>;

  if (!isManager) {
    return (
      <Layout>
        <h1 className="text-2xl font-display text-white mb-1">Login-Verlauf</h1>
        <p className="text-textMuted text-sm">Diese Ansicht ist nur für Konten mit der Rolle "manager" verfügbar.</p>
      </Layout>
    );
  }

  const uniqueUsers = Object.values(profileMap).filter((p) => events.some((e) => e.user_id === p.id));
  const filtered = filterUser ? events.filter((e) => e.user_id === filterUser) : events;

  return (
    <Layout>
      <h1 className="text-2xl font-display font-bold brand-text-gradient mb-1">Login-Verlauf</h1>
      <div className="brand-stripe w-16 mb-3" />
      <p className="text-textMuted text-sm mb-5">Wer sich wann angemeldet hat — die letzten 300 Anmeldungen im Team.</p>

      <select className="input !w-auto mb-4" value={filterUser} onChange={(e) => setFilterUser(e.target.value)}>
        <option value="">Alle Nutzer</option>
        {uniqueUsers.map((p) => <option key={p.id} value={p.id}>{p.full_name || "Unbenannt"}</option>)}
      </select>

      <div className="flex flex-col gap-2">
        {filtered.map((e) => {
          const p = profileMap[e.user_id];
          const d = new Date(e.created_at);
          return (
            <div key={e.id} className="card flex items-center gap-3 !py-2.5">
              <button onClick={() => openProfile(p?.id)}><Avatar name={p?.full_name || "?"} src={p?.avatar_url} size={30} /></button>
              <span className="text-sm text-white flex-1">{p?.full_name || "Unbekannt"}</span>
              <span className="text-xs text-textMuted font-mono">{d.toLocaleDateString("de-DE")} · {d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}</span>
            </div>
          );
        })}
        {filtered.length === 0 && <p className="text-textMuted text-sm">Noch keine Logins aufgezeichnet.</p>}
      </div>
    </Layout>
  );
}

import { useEffect, useState } from "react";
import Layout from "../../components/Layout";
import Avatar from "../../components/Avatar";
import Icon from "../../components/Icon";
import { supabase } from "../../lib/supabaseClient";
import { openProfile } from "../../lib/profileModalBus";

const TYPE_META = {
  registered: { label: "Registriert", icon: "flame", color: "#F0B23E" },
  login: { label: "Login", icon: "logout", color: "#8D90A6" },
  quiz: { label: "Quiz abgeschlossen", icon: "book", color: "#00E5C7" },
  exam: { label: "Prüfung", icon: "award", color: "var(--org-accent, #CE3A5C)" },
  roleplay: { label: "Rollenspiel", icon: "chat", color: "var(--org-color-1, #4C5DC9)" },
  community_post: { label: "Community-Beitrag", icon: "users", color: "#F0B23E" },
  community_comment: { label: "Community-Kommentar", icon: "users", color: "#F0B23E" },
};

export default function AdminActivity() {
  const [isAdmin, setIsAdmin] = useState(true);
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState([]);
  const [profileMap, setProfileMap] = useState({});
  const [filterUser, setFilterUser] = useState("");
  const [filterType, setFilterType] = useState("");

  async function load(silent) {
    if (!silent) setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const { data: me } = await supabase.from("profiles").select("role, is_admin, is_platform_admin, organization_id").eq("id", session.user.id).maybeSingle();
    if (!me || (me.role !== "manager" && !me.is_admin && !me.is_platform_admin)) { setIsAdmin(false); if (!silent) setLoading(false); return; }
    setIsPlatformAdmin(!!me.is_platform_admin);

    // Organisationsleiter/-Admins sehen nur die eigene Organisation — nur
    // Plattform-Admins sehen organisationsübergreifend alles.
    let profilesQuery = supabase.from("profiles").select("id, full_name, avatar_url, created_at");
    if (!me.is_platform_admin) profilesQuery = profilesQuery.eq("organization_id", me.organization_id);
    const { data: profiles } = await profilesQuery;
    const orgUserIds = (profiles || []).map((p) => p.id);
    const scoped = (q) => (me.is_platform_admin ? q : q.in("user_id", orgUserIds));

    const [
      { data: logins }, { data: quizzes }, { data: exams },
      { data: roleplays }, { data: posts }, { data: comments },
    ] = await Promise.all([
      scoped(supabase.from("login_events").select("*").order("created_at", { ascending: false }).limit(150)),
      scoped(supabase.from("quiz_results").select("*").order("created_at", { ascending: false }).limit(150)),
      scoped(supabase.from("exam_results").select("*").order("created_at", { ascending: false }).limit(100)),
      scoped(supabase.from("roleplay_sessions").select("*").order("created_at", { ascending: false }).limit(100)),
      scoped(supabase.from("community_posts").select("*").order("created_at", { ascending: false }).limit(100)),
      scoped(supabase.from("community_comments").select("*").order("created_at", { ascending: false }).limit(100)),
    ]);

    const map = {};
    (profiles || []).forEach((p) => { map[p.id] = p; });
    setProfileMap(map);

    const combined = [
      ...(profiles || []).map((p) => ({ type: "registered", user_id: p.id, created_at: p.created_at, detail: null })),
      ...(logins || []).map((e) => ({ type: "login", user_id: e.user_id, created_at: e.created_at, detail: null })),
      ...(quizzes || []).map((e) => ({ type: "quiz", user_id: e.user_id, created_at: e.created_at, detail: e.mc_total ? `${e.mc_score}/${e.mc_total} richtig` : null })),
      ...(exams || []).map((e) => ({ type: "exam", user_id: e.user_id, created_at: e.created_at, detail: e.passed ? "bestanden" : "nicht bestanden" })),
      ...(roleplays || []).map((e) => ({ type: "roleplay", user_id: e.user_id, created_at: e.created_at, detail: e.evaluation_score != null ? `Score ${e.evaluation_score}` : null })),
      ...(posts || []).map((e) => ({ type: "community_post", user_id: e.user_id, created_at: e.created_at, detail: e.content?.slice(0, 60) })),
      ...(comments || []).map((e) => ({ type: "community_comment", user_id: e.user_id, created_at: e.created_at, detail: e.content?.slice(0, 60) })),
    ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    setEvents(combined);
    if (!silent) setLoading(false);
  }

  useEffect(() => {
    load();
    const interval = setInterval(() => load(true), 20000);
    return () => clearInterval(interval);
  }, []);

  if (loading) return <Layout><p className="text-textMuted text-sm">Lädt...</p></Layout>;

  if (!isAdmin) {
    return (
      <Layout>
        <h1 className="text-2xl font-display text-textMain mb-1">Aktivitäten</h1>
        <p className="text-textMuted text-sm">Diese Ansicht ist nur für Manager/Admin-Konten verfügbar.</p>
      </Layout>
    );
  }

  const uniqueUsers = Object.values(profileMap).filter((p) => events.some((e) => e.user_id === p.id));
  const filtered = events.filter((e) => (!filterUser || e.user_id === filterUser) && (!filterType || e.type === filterType));

  return (
    <Layout>
      <h1 className="text-2xl font-display font-bold brand-text-gradient mb-1">Aktivitäten</h1>
      <div className="brand-stripe w-16 mb-4" />
      <p className="text-textMuted text-sm mb-6">Logins, Lernfortschritt und Community-Aktivität {isPlatformAdmin ? "organisationsübergreifend" : "deiner Organisation"}.</p>

      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <select className="input !w-auto" value={filterUser} onChange={(e) => setFilterUser(e.target.value)}>
          <option value="">Alle Nutzer</option>
          {uniqueUsers.map((p) => <option key={p.id} value={p.id}>{p.full_name || "Unbenannt"}</option>)}
        </select>
        <select className="input !w-auto" value={filterType} onChange={(e) => setFilterType(e.target.value)}>
          <option value="">Alle Aktivitäten</option>
          {Object.entries(TYPE_META).map(([key, m]) => <option key={key} value={key}>{m.label}</option>)}
        </select>
      </div>

      <div className="flex flex-col gap-2">
        {filtered.slice(0, 200).map((e, i) => {
          const p = profileMap[e.user_id];
          const meta = TYPE_META[e.type];
          const d = new Date(e.created_at);
          return (
            <div key={i} className="card flex items-center gap-3 !py-2.5">
              <button onClick={() => openProfile(p?.id)}><Avatar name={p?.full_name || "?"} src={p?.avatar_url} size={30} /></button>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm text-textMain">{p?.full_name || "Unbekannt"}</span>
                  <Icon name={meta.icon} size={12} color={meta.color} />
                  <span className="text-xs" style={{ color: meta.color }}>{meta.label}</span>
                </div>
                {e.detail && <div className="text-xs text-textMuted truncate">{e.detail}</div>}
              </div>
              <span className="text-xs text-textMuted font-mono flex-shrink-0">{d.toLocaleDateString("de-DE")} · {d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}</span>
            </div>
          );
        })}
        {filtered.length === 0 && <p className="text-textMuted text-sm">Noch keine Aktivitäten aufgezeichnet.</p>}
      </div>
    </Layout>
  );
}

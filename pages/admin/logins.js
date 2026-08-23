import { useEffect, useState } from "react";
import Layout from "../../components/Layout";
import Avatar from "../../components/Avatar";
import AdminTabs from "../../components/AdminTabs";
import { supabase } from "../../lib/supabaseClient";
import { openProfile } from "../../lib/profileModalBus";
import { ABSTAND } from "../../lib/autoRefresh";
import { getActiveOrgId } from "../../lib/activeOrg";
import { apiGet } from "../../lib/apiClient";
import { vorWieLange } from "../../lib/relativeZeit";
import { deutscherTag, nurUhrzeit, DEUTSCHE_ZONE } from "../../lib/terminzeit";
import { berlinHeute } from "../../lib/woche";

export default function AdminLogins() {
  const [isManager, setIsManager] = useState(true);
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState([]);
  const [profileMap, setProfileMap] = useState({});
  const [filterUser, setFilterUser] = useState("");
  const [uebersicht, setUebersicht] = useState(null);

  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);

  async function load(silent) {
    if (!silent) setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const { data: me } = await supabase.from("profiles").select("role, is_admin, is_platform_admin, organization_id").eq("id", session.user.id).maybeSingle();
    if (!me || (me.role !== "manager" && !me.is_admin && !me.is_platform_admin)) { setIsManager(false); if (!silent) setLoading(false); return; }
    setIsPlatformAdmin(!!me.is_platform_admin);

    // Immer auf die AKTIVE Organisation begrenzt — auch für Plattform-Admins.
    // Früher entfiel der Filter für sie ganz und sie sahen die Anmeldungen
    // aller Organisationen zugleich, ohne Firmencode.
    const activeOrgId = getActiveOrgId(me);
    const { data: profiles } = await supabase.from("profiles")
      .select("id, full_name, avatar_url").eq("organization_id", activeOrgId);
    const orgUserIds = (profiles || []).map((p) => p.id);

    const { data: ev } = await supabase.from("login_events").select("*")
      .in("user_id", orgUserIds.length ? orgUserIds : ["00000000-0000-0000-0000-000000000000"])
      .order("created_at", { ascending: false }).limit(300);

    const map = {};
    (profiles || []).forEach((p) => { map[p.id] = p; });
    setProfileMap(map);
    setEvents(ev || []);

    // Zusätzlich die Übersicht vom Server: sie kennt ALLE Mitglieder dieser
    // Organisation, auch die ohne einen einzigen Eintrag. Fehlt jemand in der
    // Liste unten, steht hier, ob er überhaupt zu dieser Organisation gehört
    // und ob es Anmeldungen von ihm gibt.
    try {
      setUebersicht(await apiGet("/api/admin/login-uebersicht"));
    } catch (e) {
      setUebersicht(null);
    }
    if (!silent) setLoading(false);
  }

  useEffect(() => {
    load();
    // Nur abfragen, wenn der Tab sichtbar ist; beim Zurückwechseln sofort.
    // Abstand: Auswertung.
    const interval = setInterval(() => { if (!document.hidden) (() => load(true))(); }, ABSTAND.GELEGENTLICH);
    const beiSichtbar = () => { if (!document.hidden) (() => load(true))(); };
    document.addEventListener("visibilitychange", beiSichtbar);
    return () => { clearInterval(interval); document.removeEventListener("visibilitychange", beiSichtbar); };
  }, []);

  if (loading) return <Layout><p className="text-textMuted text-sm">Lädt...</p></Layout>;

  if (!isManager) {
    return (
      <Layout>
        <h1 className="text-2xl font-display text-textMain mb-1">Login-Verlauf</h1>
        <p className="text-textMuted text-sm">Diese Ansicht ist nur für Manager/Admin-Konten verfügbar.</p>
      </Layout>
    );
  }

  const uniqueUsers = Object.values(profileMap).filter((p) => events.some((e) => e.user_id === p.id));
  const filtered = filterUser ? events.filter((e) => e.user_id === filterUser) : events;

  return (
    <Layout>
      <h1 className="text-2xl font-display font-medium brand-text-gradient mb-1">Login-Verlauf</h1>
      <div className="brand-stripe w-16 mb-4" />
      <AdminTabs />
      <p className="text-textMuted text-sm mb-5">
        Wer sich wann angemeldet hat — in <strong className="text-textMain">{uebersicht?.organisation || "deiner Organisation"}</strong>.
        Eine Anmeldung entsteht nur bei einer NEUEN Anmeldung; wer schon angemeldet war, erzeugt keine.
      </p>

      {/* Wer fehlt und warum — die Frage kann die Liste unten nicht
          beantworten, weil dort nur steht, was es gibt. */}
      {uebersicht && (
        <div className="card mb-5">
          <div className="font-semibold text-textMain text-sm mb-2">Alle Mitglieder dieser Organisation</div>
          <div className="flex flex-col gap-1">
            {uebersicht.personen.map((p) => {
              const heute = p.zuletzt && deutscherTag(p.zuletzt) === berlinHeute();
              return (
                <div key={p.id} className="flex items-center gap-2.5 py-1 flex-wrap">
                  <button onClick={() => openProfile(p.id)} className="flex items-center gap-2 min-w-0">
                    <Avatar name={p.name} src={p.avatar_url} size={22} />
                    <span className="text-sm text-textMain truncate">{p.name}</span>
                  </button>
                  {p.status && p.status !== "approved" && (
                    <span className="text-[10px] uppercase tracking-wide text-amber border border-amber/40 rounded px-1.5 py-0.5">
                      {p.status === "pending" ? "wartet auf Freigabe" : p.status}
                    </span>
                  )}
                  <span className="text-xs text-textMuted ml-auto">
                    {p.zuletzt
                      ? `${heute ? "heute" : vorWieLange(p.zuletzt)} · ${nurUhrzeit(p.zuletzt, DEUTSCHE_ZONE)} Uhr · ${p.anzahl}×`
                      : "noch nie angemeldet"}
                  </span>
                </div>
              );
            })}
            {uebersicht.personen.length === 0 && (
              <p className="text-xs text-textMuted">In dieser Organisation ist niemand eingetragen.</p>
            )}
          </div>
          {uebersicht.ohneOrganisation?.length > 0 && (
            <div className="mt-3 pt-2 border-t border-line">
              <div className="text-xs text-coral mb-1">
                {uebersicht.ohneOrganisation.length} Konto/Konten ohne Organisation — sie erscheinen in keiner Liste, bis sie zugeordnet sind:
              </div>
              <div className="text-xs text-textMuted">
                {uebersicht.ohneOrganisation.map((p) => p.name).join(", ")}
              </div>
            </div>
          )}
        </div>
      )}

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
              <span className="text-sm text-textMain flex-1">{p?.full_name || "Unbekannt"}</span>
              <span className="text-xs text-textMuted font-mono">{d.toLocaleDateString("de-DE")} · {d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}</span>
            </div>
          );
        })}
        {filtered.length === 0 && <p className="text-textMuted text-sm">Noch keine Logins aufgezeichnet.</p>}
      </div>
    </Layout>
  );
}

import { useEffect, useState } from "react";
import Layout from "../components/Layout";
import Icon from "../components/Icon";
import { supabase } from "../lib/supabaseClient";
import { apiGet, apiPost } from "../lib/apiClient";
import { describeRole } from "../lib/roles";

export default function Admin() {
  const [isManager, setIsManager] = useState(true);
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState([]);
  const [selfId, setSelfId] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(null);

  async function load() {
    setLoading(true);
    setError("");
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const { data: me } = await supabase.from("profiles").select("role, is_platform_admin").eq("id", session.user.id).maybeSingle();
    if (!me || (me.role !== "manager" && !me.is_platform_admin)) {
      setIsManager(false);
      setLoading(false);
      return;
    }
    try {
      const { users, selfId, isAdmin, isPlatformAdmin } = await apiGet("/api/admin/users");
      setUsers(users);
      setSelfId(selfId);
      setIsAdmin(!!isAdmin);
      setIsPlatformAdmin(!!isPlatformAdmin);
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
    // Neue Registrierungen sollen ohne manuelles Neuladen auftauchen: Echtzeit
    // auf profiles-Änderungen, plus ein 20s-Poll als Fallback falls der
    // Realtime-Kanal mal eine Änderung verpasst.
    const channel = supabase
      .channel("admin-users-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, load)
      .subscribe();
    const interval = setInterval(load, 20000);
    return () => { supabase.removeChannel(channel); clearInterval(interval); };
  }, []);

  async function runAction(targetId, action) {
    setBusyId(targetId);
    setError("");
    try {
      await apiPost("/api/admin/update-user", { targetId, action });
      await load();
    } catch (e) {
      setError(e.message);
    }
    setBusyId(null);
  }

  async function runDelete(targetId) {
    setBusyId(targetId);
    setError("");
    try {
      await apiPost("/api/admin/delete-user", { targetId });
      setConfirmDelete(null);
      await load();
    } catch (e) {
      setError(e.message);
    }
    setBusyId(null);
  }

  if (loading) return <Layout><p className="text-textMuted text-sm">Lädt...</p></Layout>;

  if (!isManager) {
    return (
      <Layout>
        <h1 className="text-2xl font-display text-white mb-1">Nutzerverwaltung</h1>
        <p className="text-textMuted text-sm">Diese Ansicht ist nur für Konten mit der Rolle "manager" verfügbar.</p>
      </Layout>
    );
  }

  return (
    <Layout>
      <h1 className="text-2xl font-display font-bold brand-text-gradient mb-1">Nutzerverwaltung</h1>
      <div className="brand-stripe w-16 mb-4" />
      <p className="text-textMuted text-sm mb-6">Alle registrierten Konten. Vergib oder entziehe Manager- oder Trainer-Rechte, oder entferne Konten. Team-Mitgliedschaft wird unter "Team (Manager)" verwaltet.</p>

      {error && <div className="card border border-coral/40 text-coral text-sm mb-4">{error}</div>}

      {users.some((u) => u.status === "pending") && (
        <div className="mb-6">
          <h2 className="text-sm font-semibold text-white mb-2.5">Ausstehende Registrierungen</h2>
          <div className="flex flex-col gap-2.5">
            {users.filter((u) => u.status === "pending").map((u) => {
              const busy = busyId === u.id;
              return (
                <div key={u.id} className="card flex items-center gap-4 flex-wrap border border-amber/30">
                  <div className="flex-1 min-w-[180px]">
                    <div className="font-semibold text-white text-sm flex items-center gap-2">
                      {u.full_name || "Unbenannt"}
                      <span className="text-[10px] uppercase tracking-wide text-amber border border-amber/40 rounded px-1.5 py-0.5">Ausstehend</span>
                    </div>
                    <div className="text-xs text-textMuted mt-1">{u.email || "–"}{isPlatformAdmin && u.organization_name ? ` · ${u.organization_name}` : ""}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button disabled={busy} onClick={() => runAction(u.id, "approve")} className="btn-ghost text-xs text-teal border-teal/40 disabled:opacity-40">Genehmigen</button>
                    <button disabled={busy} onClick={() => runAction(u.id, "reject")} className="btn-ghost text-xs text-coral border-coral/40 disabled:opacity-40">Ablehnen</button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <h2 className="text-sm font-semibold text-white mb-2.5">Alle Konten</h2>

      <div className="flex flex-col gap-2.5">
        {users.filter((u) => u.status !== "pending").map((u) => {
          const isSelf = u.id === selfId;
          const busy = busyId === u.id;
          return (
            <div key={u.id} className="card flex items-center gap-4 flex-wrap">
              <div className="w-9 h-9 rounded-full bg-surfaceRaised flex items-center justify-center text-amber flex-shrink-0">
                <Icon name="users" size={16} />
              </div>
              <div className="flex-1 min-w-[180px]">
                <div className="font-semibold text-white text-sm flex items-center gap-2">
                  {u.full_name || "Unbenannt"}
                  {isSelf && <span className="text-[10px] uppercase tracking-wide text-textMuted border border-line rounded px-1.5 py-0.5">Du</span>}
                  <span
                    className="text-[10px] uppercase tracking-wide text-amber border border-amber/40 rounded px-1.5 py-0.5 cursor-help"
                    title={describeRole(u).description}
                  >
                    {describeRole(u).label}
                  </span>
                  {u.is_team_lead && (
                    <span className="text-[10px] uppercase tracking-wide text-teal border border-teal/40 rounded px-1.5 py-0.5 cursor-help" title="Hat mindestens ein Team gegründet und leitet es.">
                      Teamleiter
                    </span>
                  )}
                  {u.status === "rejected" && <span className="text-[10px] uppercase tracking-wide text-coral border border-coral/40 rounded px-1.5 py-0.5">Abgelehnt</span>}
                </div>
                <div className="text-xs text-textMuted mt-1">{u.email || "–"}{isPlatformAdmin && u.organization_name ? ` · ${u.organization_name}` : ""}</div>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {(isAdmin || isPlatformAdmin) && (u.role === "manager" ? (
                  <button disabled={isSelf || busy} onClick={() => runAction(u.id, "remove_manager")}
                    className="btn-ghost text-xs disabled:opacity-40" title={isSelf ? "Du kannst dir nicht selbst die Rolle entziehen" : ""}>
                    Manager-Rechte entziehen
                  </button>
                ) : (
                  <button disabled={busy || u.role === "trainer"} onClick={() => runAction(u.id, "make_manager")} className="btn-ghost text-xs disabled:opacity-40">
                    Zum Manager machen
                  </button>
                ))}

                {(isAdmin || isPlatformAdmin) && (u.role === "trainer" ? (
                  <button disabled={busy} onClick={() => runAction(u.id, "remove_trainer")} className="btn-ghost text-xs disabled:opacity-40">
                    Trainer-Rechte entziehen
                  </button>
                ) : (
                  <button disabled={busy || u.role === "manager"} onClick={() => runAction(u.id, "make_trainer")} className="btn-ghost text-xs disabled:opacity-40">
                    Zum Trainer machen
                  </button>
                ))}

                {isPlatformAdmin && (u.is_admin ? (
                  <button disabled={isSelf || busy} onClick={() => runAction(u.id, "revoke_admin")}
                    className="btn-ghost text-xs text-violet border-violet/40 disabled:opacity-40" title={isSelf ? "Du kannst dir nicht selbst die Admin-Rechte entziehen" : ""}>
                    Admin-Rechte entziehen
                  </button>
                ) : (
                  <button disabled={busy} onClick={() => runAction(u.id, "grant_admin")} className="btn-ghost text-xs text-violet border-violet/40 disabled:opacity-40">
                    Admin-Rechte geben
                  </button>
                ))}

                {!isSelf && (
                  confirmDelete === u.id ? (
                    <span className="flex items-center gap-1.5">
                      <span className="text-xs text-coral">Wirklich löschen?</span>
                      <button disabled={busy} onClick={() => runDelete(u.id)} className="btn-ghost text-xs text-coral border-coral/40 disabled:opacity-40">Ja, löschen</button>
                      <button disabled={busy} onClick={() => setConfirmDelete(null)} className="btn-ghost text-xs">Abbrechen</button>
                    </span>
                  ) : (
                    <button disabled={busy} onClick={() => setConfirmDelete(u.id)} className="btn-ghost text-xs text-coral disabled:opacity-40">
                      Nutzer löschen
                    </button>
                  )
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Layout>
  );
}

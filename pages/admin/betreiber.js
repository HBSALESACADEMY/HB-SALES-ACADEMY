import { useEffect, useState } from "react";
import Layout from "../../components/Layout";
import AdminTabs from "../../components/AdminTabs";
import OrgEditor from "../../components/OrgEditor";
import { supabase } from "../../lib/supabaseClient";
import { apiGet, apiPost } from "../../lib/apiClient";

// Betreiber-Bereich: der EINZIGE Ort, an dem organisationsübergreifend
// gearbeitet wird — Kunden anlegen, Organisationen bearbeiten, Mitglieder
// zwischen Organisationen verschieben, Organisations-Manager bestimmen.
//
// Bewusst als eigene, beschriftete Seite: überall sonst gilt seit
// migration_92 bis 95 strikt die aktive Organisation, auch für
// Plattform-Admins. Diese Funktionen lassen sich aber gar nicht innerhalb
// einer Organisation erledigen — wer jemanden von A nach B verschiebt, muss
// beide sehen. Deshalb steht hier ausdrücklich dran, dass man gerade die
// Mandanten-Grenze verlässt, statt dass es still nebenher läuft.
export default function AdminBetreiber() {
  const [istBetreiber, setIstBetreiber] = useState(false);
  const [loading, setLoading] = useState(true);

  const [allOrgs, setAllOrgs] = useState([]);
  const [expandedOrgId, setExpandedOrgId] = useState(null);
  const [newOrgName, setNewOrgName] = useState("");
  const [newManagerName, setNewManagerName] = useState("");
  const [newManagerEmail, setNewManagerEmail] = useState("");
  const [newManagerPassword, setNewManagerPassword] = useState("");
  const [creatingOrg, setCreatingOrg] = useState(false);
  const [createError, setCreateError] = useState("");
  const [justCreatedSlug, setJustCreatedSlug] = useState(null);
  const [copiedSlug, setCopiedSlug] = useState(null);

  const [members, setMembers] = useState([]);
  const [memberOrgs, setMemberOrgs] = useState([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [moveTargets, setMoveTargets] = useState({});
  const [movingId, setMovingId] = useState(null);
  const [managerTargets, setManagerTargets] = useState({});
  const [settingManagerId, setSettingManagerId] = useState(null);
  const [managerError, setManagerError] = useState("");
  const [moveError, setMoveError] = useState("");

  async function loadAllOrgs() {
    const { data } = await supabase.from("organizations").select("*").order("created_at", { ascending: false });
    setAllOrgs(data || []);
  }

  async function loadMembers() {
    setMembersLoading(true);
    setMoveError("");
    try {
      const { members: m, organizations: o } = await apiGet("/api/platform/members");
      setMembers(m);
      setMemberOrgs(o);
    } catch (e) {
      setMoveError(e.message);
    }
    setMembersLoading(false);
  }

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { data: me } = await supabase.from("profiles").select("is_platform_admin").eq("id", session.user.id).maybeSingle();
      if (!me?.is_platform_admin) { setLoading(false); return; }
      setIstBetreiber(true);
      await Promise.all([loadAllOrgs(), loadMembers()]);
      setLoading(false);
    }
    load();
  }, []);



  async function createOrg() {
    if (!newOrgName.trim() || !newManagerName.trim() || !newManagerEmail.trim() || !newManagerPassword) return;
    setCreatingOrg(true);
    setCreateError("");
    setJustCreatedSlug(null);

    try {
      const { org: created } = await apiPost("/api/platform/create-organization", {
        name: newOrgName.trim(),
        managerName: newManagerName.trim(),
        managerEmail: newManagerEmail.trim(),
        managerPassword: newManagerPassword,
      });
      setNewOrgName("");
      setNewManagerName("");
      setNewManagerEmail("");
      setNewManagerPassword("");
      setJustCreatedSlug(created.slug);
      await Promise.all([loadAllOrgs(), loadMembers()]);
    } catch (e) {
      setCreateError(e.message);
    }
    setCreatingOrg(false);
  }

  function copySlug(s) {
    navigator.clipboard.writeText(s);
    setCopiedSlug(s);
    setTimeout(() => setCopiedSlug((x) => (x === s ? null : x)), 1500);
  }

  async function moveMember(memberId) {
    const targetOrgId = moveTargets[memberId];
    if (!targetOrgId) return;
    setMovingId(memberId);
    setMoveError("");
    try {
      await apiPost("/api/platform/reassign-member", { targetId: memberId, organizationId: targetOrgId });
      await loadMembers();
    } catch (e) {
      setMoveError(e.message);
    }
    setMovingId(null);
  }

  async function setOrgManager(organizationId) {
    const newManagerId = managerTargets[organizationId];
    if (!newManagerId) return;
    setSettingManagerId(organizationId);
    setManagerError("");
    try {
      await apiPost("/api/platform/set-org-manager", { organizationId, newManagerId });
      setManagerTargets((prev) => ({ ...prev, [organizationId]: "" }));
      await loadMembers();
    } catch (e) {
      setManagerError(e.message);
    }
    setSettingManagerId(null);
  }

  if (loading) return <Layout><p className="text-textMuted text-sm">Lädt...</p></Layout>;
  if (!istBetreiber) {
    return (
      <Layout>
        <h1 className="text-2xl font-display text-textMain mb-1">Betreiber</h1>
        <p className="text-textMuted text-sm">Dieser Bereich ist dem Plattform-Betreiber vorbehalten.</p>
      </Layout>
    );
  }

  return (
    <Layout>
      <h1 className="text-2xl font-display font-medium brand-text-gradient mb-1">Betreiber</h1>
      <div className="brand-stripe w-16 mb-4" />
      <AdminTabs />
      <div className="card mb-6 border-amber/40">
        <div className="text-sm font-semibold text-amber mb-1">Organisationsübergreifende Ansicht</div>
        <p className="text-xs text-textMuted">
          Hier siehst du bewusst ALLE Organisationen und deren Mitglieder — anders als überall sonst in der
          Academy, wo strikt nur die per Firmencode aktive Organisation sichtbar ist. Nötig ist das, um Kunden
          anzulegen und Personen zwischen Organisationen zu verschieben.
        </p>
      </div>

        <div className="card mb-6">
          <div className="font-semibold text-textMain text-sm mb-3">Neuen Kunden einrichten</div>
          <p className="text-textMuted text-xs mb-3">Legt die Organisation UND direkt einen Organisations-Manager-Account an, mit dem sich der Kunde sofort anmelden und eigene Nutzer freigeben kann.</p>
          <div className="flex flex-col gap-2 max-w-sm">
            <div>
              <label className="text-xs text-textMuted mb-1 block">Firmenname</label>
              <input className="input" placeholder="Firmenname des Kunden" value={newOrgName} onChange={(e) => setNewOrgName(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-textMuted mb-1 block">Name des Organisations-Managers</label>
              <input className="input" placeholder="Vor- und Nachname" value={newManagerName} onChange={(e) => setNewManagerName(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-textMuted mb-1 block">E-Mail des Organisations-Managers</label>
              <input className="input" type="email" placeholder="manager@kunde.de" value={newManagerEmail} onChange={(e) => setNewManagerEmail(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-textMuted mb-1 block">Passwort des Organisations-Managers</label>
              <input className="input" type="password" placeholder="Mindestens 10 Zeichen" value={newManagerPassword} onChange={(e) => setNewManagerPassword(e.target.value)} minLength={10} />
            </div>
            <button disabled={creatingOrg || !newOrgName.trim() || !newManagerName.trim() || !newManagerEmail.trim() || !newManagerPassword} onClick={createOrg} className="btn text-xs disabled:opacity-40 self-start mt-1">
              {creatingOrg ? "Legt an..." : "Anlegen"}
            </button>
          </div>
          {createError && <p className="text-coral text-xs mt-2">{createError}</p>}
          {justCreatedSlug && (
            <p className="text-teal text-sm mt-3">
              Angelegt! Firmencode: <span className="font-mono font-semibold">{justCreatedSlug}</span> — Firmencode und Zugangsdaten dem Organisations-Manager geben. Das Passwort kann er später selbst in seinem Profil ändern.
            </p>
          )}
        </div>

        <div className="text-xs text-textMuted uppercase tracking-wide mb-2.5">Alle Organisationen</div>
        <div className="flex flex-col gap-2.5 mb-6">
          {allOrgs.map((o) => {
            const isOpen = expandedOrgId === o.id;
            return (
              <div key={o.id} className="card">
                <div className="flex items-center gap-3.5">
                  <button onClick={() => setExpandedOrgId(isOpen ? null : o.id)} className="flex items-center gap-3.5 flex-1 min-w-0 text-left">
                    {o.logo_url && <img src={o.logo_url} alt="" className="h-8 w-auto rounded flex-shrink-0" onError={(e) => { e.target.style.display = "none"; }} />}
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-textMain text-sm">{o.name}</div>
                      <div className="text-xs text-textMuted mt-0.5">
                        Code: <span className="font-mono">{o.slug}</span> · angelegt {new Date(o.created_at).toLocaleDateString("de-DE")}
                      </div>
                    </div>
                    <Icon name="chevron" size={14} color="#5B5E70" />
                  </button>
                  <button onClick={() => copySlug(o.slug)} className="btn-ghost text-xs flex-shrink-0">
                    {copiedSlug === o.slug ? "Kopiert!" : "Code kopieren"}
                  </button>
                </div>
                {isOpen && (
                  <div className="mt-4 pt-4 border-t border-line">
                    <OrgEditor
                      org={o}
                      isOwnOrg={false}
                      canDelete
                      onSaved={loadAllOrgs}
                      onDeleted={() => { setExpandedOrgId(null); loadAllOrgs(); loadMembers(); }}
                    />

                    <div className="mt-4 pt-4 border-t border-line">
                      <div className="text-xs text-textMuted uppercase tracking-wide mb-2">Organisations-Manager</div>
                      {(() => {
                        const orgMembers = members.filter((m) => m.organization_id === o.id && m.status === "approved");
                        // Eine Organisation kann mehrere Manager haben — früher
                        // wurde hier nur einer angezeigt und beim Festlegen der
                        // bisherige still zurückgestuft.
                        const manager = orgMembers.filter((m) => m.role === "manager" && m.is_admin);
                        const candidates = orgMembers.filter((m) => !manager.some((x) => x.id === m.id));
                        const selected = managerTargets[o.id] || "";
                        const busy = settingManagerId === o.id;
                        return (
                          <>
                            {manager.length > 0 ? (
                              <ul className="text-sm text-textMain mb-2 flex flex-col gap-0.5">
                                {manager.map((m) => <li key={m.id}>{m.full_name || "Unbenannt"}</li>)}
                              </ul>
                            ) : (
                              <p className="text-sm text-textMuted mb-2">— noch kein Organisations-Manager —</p>
                            )}
                            {candidates.length > 0 ? (
                              <div className="flex items-center gap-2">
                                <select className="input flex-1" value={selected} onChange={(e) => setManagerTargets((prev) => ({ ...prev, [o.id]: e.target.value }))}>
                                  <option value="">Weitere Person wählen...</option>
                                  {candidates.map((c) => <option key={c.id} value={c.id}>{c.full_name || "Unbenannt"}</option>)}
                                </select>
                                <button disabled={!selected || busy} onClick={() => setOrgManager(o.id)} className="btn-ghost text-xs disabled:opacity-40 flex-shrink-0">
                                  {busy ? "Ernennt..." : "Ernennen"}
                                </button>
                              </div>
                            ) : (
                              <p className="text-textMuted text-xs">Alle freigegebenen Mitglieder sind bereits Manager.</p>
                            )}
                            <p className="text-[11px] text-textMuted mt-2">
                              Ernennen stuft niemanden zurück. Rechte entziehen geht gezielt unter „Verwaltung → Nutzer".
                            </p>
                            {managerError && <p className="text-coral text-xs mt-2">{managerError}</p>}
                          </>
                        );
                      })()}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="card">
          <div className="font-semibold text-textMain text-sm mb-3">Mitglieder zwischen Organisationen verteilen</div>
          {moveError && <p className="text-coral text-xs mb-3">{moveError}</p>}
          {membersLoading ? (
            <p className="text-textMuted text-sm">Lädt...</p>
          ) : (
            <div className="flex flex-col gap-2.5">
              {members.map((m) => (
                <div key={m.id} className="flex items-center gap-2.5">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-textMain truncate">{m.full_name || "Unbenannt"}</div>
                    <div className="text-[11px] text-textMuted">
                      aktuell: {orgNameById[m.organization_id] || "?"} · {m.role}{m.is_admin ? " · Admin" : ""} · {m.status}
                    </div>
                  </div>
                  <select
                    className="input !w-auto text-xs"
                    value={moveTargets[m.id] ?? m.organization_id}
                    onChange={(e) => setMoveTargets((prev) => ({ ...prev, [m.id]: e.target.value }))}
                  >
                    {memberOrgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                  </select>
                  <button
                    disabled={movingId === m.id || (moveTargets[m.id] ?? m.organization_id) === m.organization_id}
                    onClick={() => moveMember(m.id)}
                    className="btn-ghost text-xs disabled:opacity-40 flex-shrink-0"
                  >
                    {movingId === m.id ? "..." : "Verschieben"}
                  </button>
                </div>
              ))}
              {members.length === 0 && <p className="text-textMuted text-sm">Keine Mitglieder gefunden.</p>}
            </div>
          )}
        </div>
      
    </Layout>
  );
}

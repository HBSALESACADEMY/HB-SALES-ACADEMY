import { useEffect, useState } from "react";
import Layout from "../../components/Layout";
import AdminTabs from "../../components/AdminTabs";
import OrgEditor from "../../components/OrgEditor";
import { supabase } from "../../lib/supabaseClient";
import { getActiveOrgId } from "../../lib/activeOrg";

// Einstellungen der EIGENEN — bzw. der per Firmencode aktiven — Organisation.
//
// Die organisationsübergreifenden Funktionen (Kunden anlegen, Mitglieder
// zwischen Organisationen verschieben, fremde Organisationen bearbeiten)
// liegen jetzt im klar beschrifteten Betreiber-Bereich, siehe
// pages/admin/betreiber.js. Vorher liefen sie still auf dieser Seite mit:
// man sah dort Personen aus fremden Organisationen, ohne dass irgendwo
// stand, dass man das gerade tut.
export default function AdminOrganization() {
  const [isAdmin, setIsAdmin] = useState(true);
  const [loading, setLoading] = useState(true);
  const [org, setOrg] = useState(null);

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { data: me } = await supabase.from("profiles").select("is_admin, is_platform_admin, organization_id").eq("id", session.user.id).maybeSingle();
      if (!me?.is_admin) { setIsAdmin(false); setLoading(false); return; }
      // Für Plattform-Admins, die per Firmencode "als" eine andere
      // Organisation unterwegs sind: me.organization_id ist nur deren eigene
      // Heimat-Organisation — ohne getActiveOrgId würde man hier immer die
      // eigene statt der gerade aktiv verwalteten Organisation laden UND
      // beim Speichern versehentlich überschreiben.
      const activeOrgId = getActiveOrgId(me);
      const { data: orgData } = await supabase.from("organizations").select("*").eq("id", activeOrgId).maybeSingle();
      if (orgData) setOrg(orgData);
      setLoading(false);
    }
    load();
  }, []);

  if (loading) return <Layout><p className="text-textMuted text-sm">Lädt...</p></Layout>;
  if (!isAdmin) {
    return (
      <Layout>
        <h1 className="text-2xl font-display text-textMain mb-1">Organisation</h1>
        <p className="text-textMuted text-sm">Diese Ansicht ist Administratoren vorbehalten.</p>
      </Layout>
    );
  }

  return (
    <Layout>
      <h1 className="text-2xl font-display font-medium brand-text-gradient mb-1">Organisation</h1>
      <div className="brand-stripe w-16 mb-4" />
      <AdminTabs />
      <p className="text-textMuted text-sm mb-6">Name, Firmencode, Logo und Markenfarben eurer Organisation — für alle Mitglieder eurer Organisation sichtbar.</p>

      {org && (
        <div className="card mb-6">
          <OrgEditor org={org} isOwnOrg />
        </div>
      )}
    </Layout>
  );
}

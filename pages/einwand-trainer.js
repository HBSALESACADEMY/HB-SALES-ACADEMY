import { useEffect, useState } from "react";
import Layout, { getCachedOrg } from "../components/Layout";
import { supabase } from "../lib/supabaseClient";

export default function EinwandTrainer() {
  // Der Trainer läuft als eigenständiges HTML im iframe, außerhalb von
  // Layout.js — das Organisations-Logo muss ihm deshalb explizit per
  // Query-Param mitgegeben werden, sonst zeigt er das statisch hinterlegte
  // Standard-Logo, egal welche Organisation gerade angemeldet ist.
  const [logoUrl, setLogoUrl] = useState(null);
  const [logoLoaded, setLogoLoaded] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      // Von Layout.js bereits aufgelöste Organisation übernehmen (respektiert
      // für Plattform-Admins die per Firmencode gewählte "aktive" Organisation
      // statt stur profiles.organization_id — sonst weicht das Branding hier
      // von der Sidebar ab). Nur bei komplett frischem Laden (Direktaufruf,
      // Reload) noch nicht gesetzt — dann denselben Auflösungsweg wie
      // Layout.js selbst nachbauen.
      const cached = getCachedOrg();
      if (cached) {
        if (mounted) { setLogoUrl(cached.logo_url || null); setLogoLoaded(true); }
        return;
      }
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setLogoLoaded(true); return; }
      const { data: profile } = await supabase.from("profiles").select("organization_id, is_platform_admin").eq("id", session.user.id).maybeSingle();
      const activeOrgId = (profile?.is_platform_admin && sessionStorage.getItem("hb_active_org_id")) || profile?.organization_id;
      if (activeOrgId) {
        const { data: org } = await supabase.from("organizations").select("logo_url").eq("id", activeOrgId).maybeSingle();
        if (mounted) setLogoUrl(org?.logo_url || null);
      }
      if (mounted) setLogoLoaded(true);
    })();
    return () => { mounted = false; };
  }, []);

  if (!logoLoaded) return <Layout fullBleed><p className="text-textMuted text-sm p-4">Lädt...</p></Layout>;

  const logoParam = logoUrl ? `?logo=${encodeURIComponent(logoUrl)}` : "";
  return (
    <Layout fullBleed>
      <iframe
        src={`/tools/einwand-trainer.html${logoParam}`}
        title="Einwand-Trainer"
        style={{ width: "100%", height: "100%", minHeight: "70vh", border: "none", borderRadius: "10px" }}
      />
    </Layout>
  );
}

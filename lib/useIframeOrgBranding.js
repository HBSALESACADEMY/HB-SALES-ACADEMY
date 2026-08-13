import { useEffect, useState } from "react";
import { getCachedOrg } from "../components/Layout";
import { supabase } from "./supabaseClient";

// Gemeinsame Logik für Einwand-Trainer und Call-Tracker: beide laufen als
// eigenständiges HTML im iframe, außerhalb von Layout.js — Logo/Name der
// Organisation müssen ihnen deshalb explizit per Query-Param mitgegeben
// werden, sonst zeigen sie das statisch hinterlegte Standard-Branding,
// egal welche Organisation gerade angemeldet ist.
export function useIframeOrgBranding() {
  const [logoUrl, setLogoUrl] = useState(null);
  const [orgName, setOrgName] = useState(null);
  const [loaded, setLoaded] = useState(false);

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
        if (mounted) { setLogoUrl(cached.logo_url || null); setOrgName(cached.name || null); setLoaded(true); }
        return;
      }
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setLoaded(true); return; }
      const { data: profile } = await supabase.from("profiles").select("organization_id, is_platform_admin").eq("id", session.user.id).maybeSingle();
      const activeOrgId = (profile?.is_platform_admin && sessionStorage.getItem("hb_active_org_id")) || profile?.organization_id;
      if (activeOrgId) {
        const { data: org } = await supabase.from("organizations").select("name, logo_url").eq("id", activeOrgId).maybeSingle();
        if (mounted) { setLogoUrl(org?.logo_url || null); setOrgName(org?.name || null); }
      }
      if (mounted) setLoaded(true);
    })();
    return () => { mounted = false; };
  }, []);

  return { logoUrl, orgName, loaded };
}

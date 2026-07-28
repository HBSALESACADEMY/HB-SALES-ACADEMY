import { useEffect, useState } from "react";
import Layout from "../components/Layout";
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
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setLogoLoaded(true); return; }
      const { data: profile } = await supabase.from("profiles").select("organization_id").eq("id", session.user.id).maybeSingle();
      if (profile?.organization_id) {
        const { data: org } = await supabase.from("organizations").select("logo_url").eq("id", profile.organization_id).maybeSingle();
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

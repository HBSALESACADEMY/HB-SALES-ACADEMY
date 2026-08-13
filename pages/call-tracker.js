import Layout from "../components/Layout";
import { useIframeOrgBranding } from "../lib/useIframeOrgBranding";

export default function CallTracker() {
  const supaUrl = encodeURIComponent(process.env.NEXT_PUBLIC_SUPABASE_URL || "");
  const supaKey = encodeURIComponent(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "");
  const { logoUrl, orgName, loaded } = useIframeOrgBranding();

  if (!loaded) return <Layout fullBleed><p className="text-textMuted text-sm p-4">Lädt...</p></Layout>;

  const logoParam = logoUrl ? `&logo=${encodeURIComponent(logoUrl)}` : "";
  const orgParam = orgName ? `&org=${encodeURIComponent(orgName)}` : "";
  return (
    <Layout fullBleed>
      <iframe
        src={`/tools/call-tracker.html?su=${supaUrl}&sk=${supaKey}${logoParam}${orgParam}`}
        title="Call Tracker"
        style={{ width: "100%", height: "100%", minHeight: "70vh", border: "none", borderRadius: "10px" }}
      />
    </Layout>
  );
}

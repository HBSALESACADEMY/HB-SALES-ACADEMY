import Layout from "../components/Layout";
import { useIframeOrgBranding, buildOrgColorParams } from "../lib/useIframeOrgBranding";

export default function CallTracker() {
  const { logoUrl, orgName, colors, bookingInstructions, objectionCategories, loaded } = useIframeOrgBranding();

  if (!loaded) return <Layout fullBleed><p className="text-textMuted text-sm p-4">Lädt...</p></Layout>;

  const params = buildOrgColorParams(colors);
  params.set("su", process.env.NEXT_PUBLIC_SUPABASE_URL || "");
  params.set("sk", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "");
  if (logoUrl) params.set("logo", logoUrl);
  if (orgName) params.set("org", orgName);
  if (bookingInstructions) params.set("booking", bookingInstructions);
  if (objectionCategories) params.set("categories", JSON.stringify(objectionCategories));

  return (
    <Layout fullBleed>
      <iframe
        src={`/tools/call-tracker.html?${params.toString()}`}
        title="Call Tracker"
        style={{ width: "100%", height: "100%", minHeight: "70vh", border: "none", borderRadius: "10px" }}
      />
    </Layout>
  );
}

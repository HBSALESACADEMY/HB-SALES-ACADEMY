import Layout from "../components/Layout";
import { useIframeOrgBranding, buildOrgColorParams } from "../lib/useIframeOrgBranding";

export default function EinwandTrainer() {
  const { logoUrl, orgName, colors, objectionCategories, loaded } = useIframeOrgBranding();

  if (!loaded) return <Layout fullBleed><p className="text-textMuted text-sm p-4">Lädt...</p></Layout>;

  const params = buildOrgColorParams(colors);
  params.set("su", process.env.NEXT_PUBLIC_SUPABASE_URL || "");
  params.set("sk", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "");
  if (logoUrl) params.set("logo", logoUrl);
  if (orgName) params.set("org", orgName);
  if (objectionCategories) params.set("categories", JSON.stringify(objectionCategories));
  const qs = params.toString();

  return (
    <Layout fullBleed>
      <iframe
        src={`/tools/einwand-trainer.html${qs ? "?" + qs : ""}`}
        title="Einwand-Trainer"
        style={{ width: "100%", height: "100%", minHeight: "70vh", border: "none", borderRadius: "10px" }}
      />
    </Layout>
  );
}

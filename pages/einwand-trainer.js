import Layout from "../components/Layout";
import { useIframeOrgBranding, buildOrgColorParams } from "../lib/useIframeOrgBranding";

export default function EinwandTrainer() {
  const { logoUrl, orgName, colors, loaded } = useIframeOrgBranding();

  if (!loaded) return <Layout fullBleed><p className="text-textMuted text-sm p-4">Lädt...</p></Layout>;

  const params = buildOrgColorParams(colors);
  if (logoUrl) params.set("logo", logoUrl);
  if (orgName) params.set("org", orgName);
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

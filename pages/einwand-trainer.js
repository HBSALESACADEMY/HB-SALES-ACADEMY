import Layout from "../components/Layout";
import { useIframeOrgBranding } from "../lib/useIframeOrgBranding";

export default function EinwandTrainer() {
  const { logoUrl, loaded } = useIframeOrgBranding();

  if (!loaded) return <Layout fullBleed><p className="text-textMuted text-sm p-4">Lädt...</p></Layout>;

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

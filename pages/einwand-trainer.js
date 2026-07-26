import Layout from "../components/Layout";

export default function EinwandTrainer() {
  return (
    <Layout fullBleed>
      <iframe
        src="/tools/einwand-trainer.html"
        title="Einwand-Trainer"
        style={{ width: "100%", height: "calc(100vh - 48px)", border: "none", borderRadius: "10px" }}
      />
    </Layout>
  );
}

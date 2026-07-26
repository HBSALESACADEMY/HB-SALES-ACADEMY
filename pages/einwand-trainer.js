import Layout from "../components/Layout";

export default function EinwandTrainer() {
  return (
    <Layout fullBleed>
      <iframe
        src="/tools/einwand-trainer.html"
        title="Einwand-Trainer"
        style={{ width: "100%", height: "100%", minHeight: "70vh", border: "none", borderRadius: "10px" }}
      />
    </Layout>
  );
}

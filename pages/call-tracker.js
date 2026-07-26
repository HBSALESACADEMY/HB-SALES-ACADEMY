import Layout from "../components/Layout";

export default function CallTracker() {
  return (
    <Layout fullBleed>
      <iframe
        src="/tools/call-tracker.html"
        title="Call Tracker"
        style={{ width: "100%", height: "calc(100vh - 48px)", border: "none", borderRadius: "10px" }}
      />
    </Layout>
  );
}

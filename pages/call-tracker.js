import Layout from "../components/Layout";

export default function CallTracker() {
  const supaUrl = encodeURIComponent(process.env.NEXT_PUBLIC_SUPABASE_URL || "");
  const supaKey = encodeURIComponent(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "");
  return (
    <Layout fullBleed>
      <iframe
        src={`/tools/call-tracker.html?su=${supaUrl}&sk=${supaKey}`}
        title="Call Tracker"
        style={{ width: "100%", height: "100%", minHeight: "70vh", border: "none", borderRadius: "10px" }}
      />
    </Layout>
  );
}

import { requireUser } from "../../lib/supabaseServer";
import { getAdminSupabase } from "../../lib/supabaseAdmin";

// Erzeugt eine kurzlebige signierte URL für eine hochgeladene Recording-Datei.
// Der call-recordings-Bucket ist privat — Zugriff nur für die/den
// Ersteller:in, oder (bei visibility='org') für alle in derselben
// Organisation, oder für Plattform-Admins.
export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  const auth = await requireUser(req, res);
  if (!auth) return;
  const { client, user } = auth;

  const { recordingId } = req.query;
  if (!recordingId) return res.status(400).json({ error: "recordingId erforderlich." });

  try {
    const admin = getAdminSupabase();
    const { data: recording } = await admin.from("call_recordings").select("created_by, visibility, recording_path").eq("id", recordingId).maybeSingle();
    if (!recording) return res.status(404).json({ error: "Recording nicht gefunden." });

    if (recording.created_by !== user.id) {
      const { data: me } = await client.from("profiles").select("role, is_admin, is_platform_admin, organization_id").eq("id", user.id).maybeSingle();
      const { data: owner } = await admin.from("profiles").select("organization_id").eq("id", recording.created_by).maybeSingle();
      const sameOrg = owner && me && owner.organization_id === me.organization_id;
      const allowedViaOrgVisibility = recording.visibility === "org" && sameOrg;
      const allowedViaOversight = sameOrg && (me?.role === "manager" || me?.is_admin);
      if (!me?.is_platform_admin && !allowedViaOrgVisibility && !allowedViaOversight) {
        return res.status(403).json({ error: "Kein Zugriff auf diese Aufnahme." });
      }
    }

    const { data, error } = await admin.storage.from("call-recordings").createSignedUrl(recording.recording_path, 3600);
    if (error) throw error;

    return res.status(200).json({ url: data.signedUrl });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Fehler beim Abrufen der Aufnahme." });
  }
}

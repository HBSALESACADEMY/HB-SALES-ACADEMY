import { requireUser } from "../../../lib/supabaseServer";
import { getAdminSupabase } from "../../../lib/supabaseAdmin";

// Ersetzt den Organisations-Manager einer Organisation: der bisherige
// Organisations-Manager (role=manager + is_admin=true) wird auf ein
// normales Mitglied zurückgestuft, der ausgewählte Nutzer wird zum neuen
// Organisations-Manager. Nur für Plattform-Admins.
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const auth = await requireUser(req, res);
  if (!auth) return;
  const { client, user } = auth;

  const { data: me } = await client.from("profiles").select("is_platform_admin").eq("id", user.id).maybeSingle();
  if (!me?.is_platform_admin) return res.status(403).json({ error: "Nur für Plattform-Admins verfügbar." });

  const { organizationId, newManagerId } = req.body || {};
  if (!organizationId || !newManagerId) return res.status(400).json({ error: "organizationId und newManagerId erforderlich." });

  try {
    const admin = getAdminSupabase();

    const { data: target } = await admin.from("profiles").select("id, organization_id").eq("id", newManagerId).maybeSingle();
    if (!target || target.organization_id !== organizationId) {
      return res.status(400).json({ error: "Der ausgewählte Nutzer gehört nicht zu dieser Organisation." });
    }

    // Bisherige Organisations-Manager dieser Organisation zurückstufen —
    // is_platform_admin-Konten bleiben davon unberührt (siehe reassign-member.js).
    const { error: demoteErr } = await admin.from("profiles")
      .update({ role: "rep", is_admin: false })
      .eq("organization_id", organizationId)
      .eq("role", "manager")
      .eq("is_admin", true)
      .eq("is_platform_admin", false);
    if (demoteErr) throw demoteErr;

    const { error: promoteErr } = await admin.from("profiles")
      .update({ role: "manager", is_admin: true, status: "approved" })
      .eq("id", newManagerId);
    if (promoteErr) throw promoteErr;

    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Fehler beim Ändern des Organisations-Managers." });
  }
}

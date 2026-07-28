import { requireUser } from "../../../lib/supabaseServer";
import { getAdminSupabase } from "../../../lib/supabaseAdmin";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const auth = await requireUser(req, res);
  if (!auth) return;
  const { client, user } = auth;

  const { data: me } = await client.from("profiles").select("is_platform_admin").eq("id", user.id).maybeSingle();
  if (!me?.is_platform_admin) return res.status(403).json({ error: "Nur für Plattform-Admins verfügbar." });

  const { organizationId } = req.body || {};
  if (!organizationId) return res.status(400).json({ error: "organizationId erforderlich." });

  try {
    const admin = getAdminSupabase();
    const { error } = await admin.from("organizations").delete().eq("id", organizationId);
    if (error) {
      // Fremdschlüssel-Verletzung: profiles.organization_id verweist noch auf diese Organisation.
      if (error.code === "23503") {
        return res.status(409).json({ error: "Diese Organisation hat noch Mitglieder. Erst alle Mitglieder verschieben oder entfernen." });
      }
      throw error;
    }
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Fehler beim Löschen." });
  }
}

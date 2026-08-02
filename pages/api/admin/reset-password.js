import { requireUser } from "../../../lib/supabaseServer";
import { getAdminSupabase } from "../../../lib/supabaseAdmin";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const auth = await requireUser(req, res);
  if (!auth) return;
  const { client, user } = auth;

  const { data: me } = await client.from("profiles").select("is_admin, is_platform_admin, organization_id").eq("id", user.id).maybeSingle();
  if (!me || (!me.is_admin && !me.is_platform_admin)) {
    return res.status(403).json({ error: "Nur Admins können Passwörter zurücksetzen." });
  }

  const { targetId, newPassword } = req.body || {};
  if (!targetId || !newPassword) return res.status(400).json({ error: "targetId und newPassword erforderlich." });
  if (newPassword.length < 10) return res.status(400).json({ error: "Das Passwort muss mindestens 10 Zeichen lang sein." });

  try {
    const admin = getAdminSupabase();

    // Service-Role umgeht RLS komplett — ohne diese Prüfung könnte ein Admin
    // das Passwort eines Nutzers einer FREMDEN Organisation zurücksetzen.
    // Plattform-Admins sind bewusst davon ausgenommen.
    if (!me.is_platform_admin) {
      const { data: target } = await admin.from("profiles").select("organization_id").eq("id", targetId).maybeSingle();
      if (!target || target.organization_id !== me.organization_id) {
        return res.status(403).json({ error: "Nutzer gehört nicht zu deiner Organisation." });
      }
    }

    const { error } = await admin.auth.admin.updateUserById(targetId, { password: newPassword });
    if (error) throw error;

    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Fehler beim Zurücksetzen des Passworts." });
  }
}

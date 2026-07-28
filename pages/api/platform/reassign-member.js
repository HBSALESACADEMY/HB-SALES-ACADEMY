import { requireUser } from "../../../lib/supabaseServer";
import { getAdminSupabase } from "../../../lib/supabaseAdmin";

// Verschiebt einen bestehenden Nutzer in eine andere Organisation. Läuft
// bewusst über Service-Role: der prevent_organization_change-Trigger blockt
// jede organization_id-Änderung, bei der auth.uid() gesetzt ist (also auch
// bei einem eingeloggten Plattform-Admin über den normalen Client) — nur
// Service-Role-Aufrufe (auth.uid() = null) dürfen das.
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const auth = await requireUser(req, res);
  if (!auth) return;
  const { client, user } = auth;

  const { data: me } = await client.from("profiles").select("is_platform_admin").eq("id", user.id).maybeSingle();
  if (!me?.is_platform_admin) return res.status(403).json({ error: "Nur für Plattform-Admins verfügbar." });

  const { targetId, organizationId } = req.body || {};
  if (!targetId || !organizationId) return res.status(400).json({ error: "targetId und organizationId erforderlich." });

  try {
    const admin = getAdminSupabase();

    const { data: org } = await admin.from("organizations").select("id").eq("id", organizationId).maybeSingle();
    if (!org) return res.status(404).json({ error: "Ziel-Organisation nicht gefunden." });

    // Rolle zurücksetzen: Manager-/Admin-Rechte der ALTEN Organisation sollen
    // nicht automatisch in die neue Organisation mit übernommen werden.
    const { error: updErr } = await admin.from("profiles").update({
      organization_id: organizationId,
      role: "rep",
      is_admin: false,
    }).eq("id", targetId);
    if (updErr) throw updErr;

    // Zugehörigkeiten zur alten Organisation aufräumen, die sonst verwaist wären.
    await admin.from("team_members").delete().eq("user_id", targetId);
    await admin.from("team_requests").delete().eq("requester_id", targetId);
    await admin.from("mentor_pairs").update({ active: false }).or(`mentor_id.eq.${targetId},mentee_id.eq.${targetId}`);

    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Fehler beim Verschieben." });
  }
}

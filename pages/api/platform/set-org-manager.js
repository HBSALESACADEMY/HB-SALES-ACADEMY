import { requireUser } from "../../../lib/supabaseServer";
import { getAdminSupabase } from "../../../lib/supabaseAdmin";

// Ernennt eine Person zum Organisations-Manager (role=manager + is_admin).
// Nur für Plattform-Admins.
//
// Bewusst OHNE Zurückstufen anderer: früher wurde der bisherige
// Organisations-Manager dabei still zum normalen Mitglied degradiert. Das
// widersprach der Nutzerverwaltung, die schon immer beliebig viele Manager
// zuliess — wer dort zwei Manager eingerichtet hatte, verlor sie hier
// unbemerkt wieder. Eine Organisation kann also mehrere Manager haben;
// Rechte entziehen geht gezielt über Verwaltung -> Nutzer.
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

    const { error: promoteErr } = await admin.from("profiles")
      .update({ role: "manager", is_admin: true, status: "approved" })
      .eq("id", newManagerId);
    if (promoteErr) throw promoteErr;

    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Fehler beim Ändern des Organisations-Managers." });
  }
}

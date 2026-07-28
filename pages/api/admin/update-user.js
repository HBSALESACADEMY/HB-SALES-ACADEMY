import { requireUser } from "../../../lib/supabaseServer";
import { getAdminSupabase } from "../../../lib/supabaseAdmin";

// action: "make_manager" | "remove_manager" | "approve" | "reject"
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const auth = await requireUser(req, res);
  if (!auth) return;
  const { client, user } = auth;

  const { data: me } = await client.from("profiles").select("role, is_admin, organization_id").eq("id", user.id).maybeSingle();
  if (!me || me.role !== "manager") {
    return res.status(403).json({ error: "Nur Manager können Nutzer verwalten." });
  }

  const { targetId, action } = req.body || {};
  if (!targetId || !action) return res.status(400).json({ error: "targetId und action erforderlich." });

  const roleActions = ["make_manager", "remove_manager"];
  if (roleActions.includes(action) && !me.is_admin) {
    return res.status(403).json({ error: "Nur Admins können Manager-Rechte vergeben oder entziehen." });
  }

  if (action === "remove_manager" && targetId === user.id) {
    return res.status(400).json({ error: "Du kannst dir nicht selbst die Manager-Rolle entziehen." });
  }

  try {
    const admin = getAdminSupabase();

    // Service-Role umgeht RLS komplett — ohne diese Prüfung könnte ein Manager
    // Nutzer einer FREMDEN Organisation genehmigen/löschen/befördern.
    const { data: target } = await admin.from("profiles").select("organization_id").eq("id", targetId).maybeSingle();
    if (!target || target.organization_id !== me.organization_id) {
      return res.status(403).json({ error: "Nutzer gehört nicht zu deiner Organisation." });
    }

    let update = {};
    if (action === "make_manager") update = { role: "manager" };
    else if (action === "remove_manager") update = { role: "rep" };
    else if (action === "approve") update = { status: "approved" };
    else if (action === "reject") update = { status: "rejected" };
    else return res.status(400).json({ error: "Unbekannte Aktion." });

    const { error } = await admin.from("profiles").update(update).eq("id", targetId);
    if (error) throw error;

    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Fehler beim Aktualisieren des Nutzers." });
  }
}

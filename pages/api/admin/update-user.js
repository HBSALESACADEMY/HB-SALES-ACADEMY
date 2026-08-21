import { requireUser } from "../../../lib/supabaseServer";
import { getAdminSupabase } from "../../../lib/supabaseAdmin";

// action: "make_manager" | "remove_manager" | "approve" | "reject"
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const auth = await requireUser(req, res);
  if (!auth) return;
  const { client, user } = auth;

  const { data: me } = await client.from("profiles").select("role, is_admin, is_platform_admin, organization_id").eq("id", user.id).maybeSingle();
  // is_admin gehört dazu: "Admin der Organisation" ist genau die Rolle, die
  // Nutzer freischaltet. Vorher war ausgesperrt, wer als Admin gekennzeichnet
  // ist, aber nicht zusätzlich role='manager' trägt.
  if (!me || (me.role !== "manager" && !me.is_admin && !me.is_platform_admin)) {
    return res.status(403).json({ error: "Nur Manager können Nutzer verwalten." });
  }

  const { targetId, action } = req.body || {};
  if (!targetId || !action) return res.status(400).json({ error: "targetId und action erforderlich." });

  const roleActions = ["make_manager", "remove_manager", "make_trainer", "remove_trainer", "make_backend", "remove_backend"];
  if (roleActions.includes(action) && !me.is_admin && !me.is_platform_admin) {
    return res.status(403).json({ error: "Nur Admins können Rollen vergeben oder entziehen." });
  }

  const adminActions = ["grant_admin", "revoke_admin"];
  if (adminActions.includes(action) && !me.is_platform_admin) {
    return res.status(403).json({ error: "Nur Plattform-Admins können Admin-Rechte vergeben oder entziehen." });
  }

  if (action === "remove_manager" && targetId === user.id) {
    return res.status(400).json({ error: "Du kannst dir nicht selbst die Manager-Rolle entziehen." });
  }
  if (action === "revoke_admin" && targetId === user.id) {
    return res.status(400).json({ error: "Du kannst dir nicht selbst die Admin-Rechte entziehen." });
  }

  try {
    const admin = getAdminSupabase();

    // Service-Role umgeht RLS komplett — ohne diese Prüfung könnte ein Manager
    // Nutzer einer FREMDEN Organisation genehmigen/löschen/befördern.
    // Plattform-Admins sind bewusst von dieser Einschränkung ausgenommen.
    if (!me.is_platform_admin) {
      const { data: target } = await admin.from("profiles").select("organization_id").eq("id", targetId).maybeSingle();
      if (!target || target.organization_id !== me.organization_id) {
        return res.status(403).json({ error: "Nutzer gehört nicht zu deiner Organisation." });
      }
    }

    let update = {};
    // Manager IST Admin seiner Organisation — anders als beim Anlegen einer
    // neuen Organisation (pages/api/platform/create-organization.js) wurde
    // is_admin hier bisher nicht mitgesetzt. Die so ernannten Manager sahen
    // dadurch weniger und durften weniger als die zum Kunden mitgelieferten,
    // ohne dass irgendwo ein Unterschied erkennbar war.
    //
    // "Admin" ist dabei immer organisationsbezogen: die Zugriffsregeln
    // prüfen zusätzlich die Organisation, plattformweite Rechte gibt nur
    // is_platform_admin.
    if (action === "make_manager") update = { role: "manager", is_admin: true };
    else if (action === "remove_manager") update = { role: "rep", is_admin: false };
    else if (action === "make_trainer") update = { role: "trainer" };
    else if (action === "remove_trainer") update = { role: "rep" };
    else if (action === "make_backend") update = { role: "backend" };
    else if (action === "remove_backend") update = { role: "rep" };
    else if (action === "approve") update = { status: "approved" };
    else if (action === "reject") update = { status: "rejected" };
    else if (action === "grant_admin") update = { is_admin: true };
    else if (action === "revoke_admin") update = { is_admin: false };
    else return res.status(400).json({ error: "Unbekannte Aktion." });

    const { error } = await admin.from("profiles").update(update).eq("id", targetId);
    if (error) throw error;

    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Fehler beim Aktualisieren des Nutzers." });
  }
}

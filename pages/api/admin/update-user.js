import { requireUser } from "../../../lib/supabaseServer";
import { getAdminSupabase } from "../../../lib/supabaseAdmin";

// action: "make_manager" | "remove_manager" | "add_to_team" | "remove_from_team"
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const auth = await requireUser(req, res);
  if (!auth) return;
  const { client, user } = auth;

  const { data: me } = await client.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (!me || me.role !== "manager") {
    return res.status(403).json({ error: "Nur Manager können Nutzer verwalten." });
  }

  const { targetId, action } = req.body || {};
  if (!targetId || !action) return res.status(400).json({ error: "targetId und action erforderlich." });

  if (action === "remove_manager" && targetId === user.id) {
    return res.status(400).json({ error: "Du kannst dir nicht selbst die Manager-Rolle entziehen." });
  }

  try {
    const admin = getAdminSupabase();
    let update = {};
    if (action === "make_manager") update = { role: "manager" };
    else if (action === "remove_manager") update = { role: "rep" };
    else if (action === "add_to_team") update = { manager_id: user.id };
    else if (action === "remove_from_team") update = { manager_id: null };
    else return res.status(400).json({ error: "Unbekannte Aktion." });

    const { error } = await admin.from("profiles").update(update).eq("id", targetId);
    if (error) throw error;

    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Fehler beim Aktualisieren des Nutzers." });
  }
}

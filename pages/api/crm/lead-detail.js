import { requireUser } from "../../../lib/supabaseServer";
import { closeGetLead, closeListActivity } from "../../../lib/closeClient";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  const auth = await requireUser(req, res);
  if (!auth) return;

  const leadId = req.query.id;
  if (!leadId) return res.status(400).json({ error: "id erforderlich." });

  const { data: connection } = await auth.client.from("crm_connections").select("api_key").eq("user_id", auth.user.id).maybeSingle();
  if (!connection) return res.status(400).json({ error: "Kein Close-Konto verbunden." });

  try {
    const [lead, activity] = await Promise.all([
      closeGetLead(connection.api_key, leadId),
      closeListActivity(connection.api_key, leadId),
    ]);
    return res.status(200).json({ lead, activity });
  } catch (e) {
    return res.status(502).json({ error: e.message || "Lead-Details konnten nicht geladen werden." });
  }
}

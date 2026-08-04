import { requireUser } from "../../../lib/supabaseServer";
import { closeListLeads, closeListFollowUps } from "../../../lib/closeClient";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  const auth = await requireUser(req, res);
  if (!auth) return;

  const { data: connection } = await auth.client.from("crm_connections").select("*").eq("user_id", auth.user.id).maybeSingle();
  if (!connection) return res.status(200).json({ connected: false, leads: [], followUps: [] });

  try {
    const [leads, followUps] = await Promise.all([
      closeListLeads(connection.api_key),
      connection.close_user_id ? closeListFollowUps(connection.api_key, connection.close_user_id) : Promise.resolve([]),
    ]);
    return res.status(200).json({ connected: true, email: connection.close_user_email, leads, followUps });
  } catch (e) {
    return res.status(502).json({ error: e.message || "Close-Daten konnten nicht geladen werden.", connected: true });
  }
}

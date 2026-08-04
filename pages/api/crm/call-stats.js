import { requireUser } from "../../../lib/supabaseServer";
import { closeCountOutgoingCallsByDay } from "../../../lib/closeClient";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  const auth = await requireUser(req, res);
  if (!auth) return;

  const { data: connection } = await auth.client.from("crm_connections").select("api_key, close_user_id").eq("user_id", auth.user.id).maybeSingle();
  if (!connection || !connection.close_user_id) return res.status(200).json({ connected: false, byDay: {} });

  try {
    const since = new Date();
    since.setDate(since.getDate() - 7);
    const byDay = await closeCountOutgoingCallsByDay(connection.api_key, connection.close_user_id, since.toISOString());
    return res.status(200).json({ connected: true, byDay });
  } catch (e) {
    // Close-Sync ist optional — bei Fehler lieber die Leiste ausblenden, statt
    // fälschlich "0 Anrufe" zu zeigen (das Tool bleibt sonst voll funktionsfähig).
    return res.status(200).json({ connected: false, byDay: {} });
  }
}

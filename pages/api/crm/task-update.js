import { requireUser } from "../../../lib/supabaseServer";
import { closeUpdateTask } from "../../../lib/closeClient";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const auth = await requireUser(req, res);
  if (!auth) return;

  const { taskId, isComplete, text, date } = req.body || {};
  if (!taskId) return res.status(400).json({ error: "taskId erforderlich." });

  const { data: connection } = await auth.client.from("crm_connections").select("api_key").eq("user_id", auth.user.id).maybeSingle();
  if (!connection) return res.status(400).json({ error: "Kein Close-Konto verbunden." });

  try {
    const task = await closeUpdateTask(connection.api_key, taskId, { isComplete, text, date });
    return res.status(200).json({ task });
  } catch (e) {
    return res.status(502).json({ error: e.message || "Aufgabe konnte nicht aktualisiert werden." });
  }
}

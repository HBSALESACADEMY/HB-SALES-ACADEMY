import { requireUser } from "../../../lib/supabaseServer";
import { closeCreateNote } from "../../../lib/closeClient";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const auth = await requireUser(req, res);
  if (!auth) return;

  const { leadId, note } = req.body || {};
  if (!leadId || !note?.trim()) return res.status(400).json({ error: "leadId und note erforderlich." });

  const { data: connection } = await auth.client.from("crm_connections").select("api_key").eq("user_id", auth.user.id).maybeSingle();
  if (!connection) return res.status(400).json({ error: "Kein Close-Konto verbunden." });

  try {
    const created = await closeCreateNote(connection.api_key, leadId, note.trim());
    return res.status(200).json({ note: created });
  } catch (e) {
    return res.status(502).json({ error: e.message || "Notiz konnte nicht gespeichert werden." });
  }
}

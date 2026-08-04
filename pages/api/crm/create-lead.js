import { requireUser } from "../../../lib/supabaseServer";
import { closeCreateLead } from "../../../lib/closeClient";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const auth = await requireUser(req, res);
  if (!auth) return;

  const { name, contactName, email, phone, description } = req.body || {};
  if (!name?.trim()) return res.status(400).json({ error: "Name erforderlich." });

  const { data: connection } = await auth.client.from("crm_connections").select("api_key").eq("user_id", auth.user.id).maybeSingle();
  if (!connection) return res.status(400).json({ error: "Kein Close-Konto verbunden." });

  try {
    const lead = await closeCreateLead(connection.api_key, {
      name: name.trim(),
      contactName: contactName?.trim() || undefined,
      email: email?.trim() || undefined,
      phone: phone?.trim() || undefined,
      description: description?.trim() || undefined,
    });
    return res.status(200).json({ lead });
  } catch (e) {
    return res.status(502).json({ error: e.message || "Lead konnte nicht angelegt werden." });
  }
}

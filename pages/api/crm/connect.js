import { requireUser } from "../../../lib/supabaseServer";
import { closeValidateKey } from "../../../lib/closeClient";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const auth = await requireUser(req, res);
  if (!auth) return;

  const apiKey = (req.body?.apiKey || "").trim();
  if (!apiKey) return res.status(400).json({ error: "API-Key erforderlich." });

  try {
    const { closeUserId, email } = await closeValidateKey(apiKey);

    const { error } = await auth.client.from("crm_connections").upsert({
      user_id: auth.user.id,
      provider: "close",
      api_key: apiKey,
      close_user_id: closeUserId,
      close_user_email: email,
      connected_at: new Date().toISOString(),
    }, { onConflict: "user_id" });
    if (error) throw error;

    return res.status(200).json({ connected: true, email });
  } catch (e) {
    return res.status(400).json({ error: e.message || "Verbindung fehlgeschlagen." });
  }
}

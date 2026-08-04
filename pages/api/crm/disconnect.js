import { requireUser } from "../../../lib/supabaseServer";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const auth = await requireUser(req, res);
  if (!auth) return;

  const { error } = await auth.client.from("crm_connections").delete().eq("user_id", auth.user.id);
  if (error) return res.status(500).json({ error: error.message });

  return res.status(200).json({ connected: false });
}

import { requireUser } from "../../lib/supabaseServer";
import { getAdminSupabase } from "../../lib/supabaseAdmin";
import { SCENARIOS } from "../../lib/scenarios";

// XP-Betrag wird serverseitig aus dem festen Szenario-Baum abgeleitet, nicht
// vom Client übermittelt — sonst ließe sich per Browser-Konsole ein
// beliebiger increment_xp-Aufruf erreichen.
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const auth = await requireUser(req, res);
  if (!auth) return;
  const { user } = auth;

  const { scenarioId, nodeId } = req.body || {};
  if (!scenarioId || !nodeId) return res.status(400).json({ error: "scenarioId und nodeId erforderlich." });

  try {
    const scenario = SCENARIOS.find((s) => s.id === scenarioId);
    const node = scenario?.nodes?.[nodeId];
    if (!node || !node.outcome) return res.status(400).json({ error: "Kein bewertbarer Szenario-Schritt." });

    const amount = Math.round((node.score || 0) / 5);
    if (amount > 0) {
      try { await getAdminSupabase().rpc("increment_xp", { uid: user.id, amount }); } catch (e) { console.error("increment_xp failed:", e.message); }
    }
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message || "Konnte nicht verarbeitet werden." });
  }
}

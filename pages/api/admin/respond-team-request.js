import { requireUser } from "../../../lib/supabaseServer";
import { getAdminSupabase } from "../../../lib/supabaseAdmin";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const auth = await requireUser(req, res);
  if (!auth) return;

  try {
    const { requestId, action } = req.body; // action: 'accept' | 'decline'
    if (!requestId || !["accept", "decline"].includes(action)) {
      return res.status(400).json({ error: "Ungültige Anfrage." });
    }

    const admin = getAdminSupabase();
    const { data: request, error: reqErr } = await admin.from("team_requests").select("*").eq("id", requestId).maybeSingle();
    if (reqErr || !request) return res.status(404).json({ error: "Anfrage nicht gefunden." });
    if (request.manager_id !== auth.user.id) return res.status(403).json({ error: "Nur der angefragte Manager darf antworten." });

    if (action === "decline") {
      await admin.from("team_requests").update({ status: "declined" }).eq("id", requestId);
      return res.status(200).json({ ok: true });
    }

    // Annehmen: Requester dem Team zuordnen + Anfrage als angenommen markieren.
    const { error: updErr } = await admin.from("profiles").update({ manager_id: auth.user.id }).eq("id", request.requester_id);
    if (updErr) return res.status(500).json({ error: updErr.message });
    await admin.from("team_requests").update({ status: "accepted" }).eq("id", requestId);

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message || "Unbekannter Fehler." });
  }
}

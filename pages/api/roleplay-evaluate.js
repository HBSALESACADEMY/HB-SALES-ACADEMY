import { requireUser } from "../../lib/supabaseServer";
import { callAI } from "../../lib/aiClient";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const auth = await requireUser(req, res);
  if (!auth) return;
  if (!process.env.GEMINI_API_KEY) return res.status(500).json({ error: "GEMINI_API_KEY fehlt." });

  try {
    const { personaId, scenarioId, difficulty, messages, detected } = req.body;
    const transcript = messages.map((m) => (m.role === "user" ? "Verkäufer" : "Kunde") + ": " + m.content).join("\n");

    const raw = await callAI(
      "Du bist ein Trainer für Verkaufspsychologie. Bewerte das folgende Verkaufsgespräch auf Deutsch, konstruktiv und konkret. Antworte AUSSCHLIESSLICH als valides JSON-Objekt mit den Feldern: " +
        '{"score": <Zahl 0-100>, "staerken": [<max 3 kurze Punkte>], "verbesserung": [<max 3 kurze Punkte>], "zusammenfassung": "<2-3 Sätze>"}. Kein Text außerhalb des JSON.',
      [{ role: "user", content: transcript }],
      500
    );

    let evaluation;
    try {
      evaluation = JSON.parse(raw.replace(/```json|```/g, "").trim());
    } catch (e) {
      evaluation = { score: null, staerken: [], verbesserung: [], zusammenfassung: raw };
    }

    const turnCount = messages.filter((m) => m.role === "user").length;
    const { error: insertError } = await auth.client.from("roleplay_sessions").insert({
      user_id: auth.user.id,
      persona_id: personaId,
      scenario_id: scenarioId,
      difficulty,
      turns: turnCount,
      transcript: messages,
      detected_principles: detected,
      evaluation: evaluation.zusammenfassung || "",
      evaluation_score: evaluation.score,
    });
    if (insertError) console.error("insert roleplay_sessions failed:", insertError.message);

    const xpGain = 30;
    try { await auth.client.rpc("increment_xp", { uid: auth.user.id, amount: xpGain }); } catch (e) { console.error("increment_xp failed:", e.message); }

    return res.status(200).json({ evaluation });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message || "Unbekannter Fehler." });
  }
}

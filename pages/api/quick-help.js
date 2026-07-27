import { requireUser } from "../../lib/supabaseServer";
import { callAI } from "../../lib/aiClient";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const auth = await requireUser(req, res);
  if (!auth) return;

  try {
    const { question } = req.body;
    if (!question || !question.trim()) return res.status(400).json({ error: "Frage fehlt." });

    const answer = await callAI(
      "Du bist ein erfahrener Vertriebscoach. Beantworte die folgende kurze Verkaufsfrage knapp, praktisch und konkret (maximal 4-5 Sätze), auf Deutsch. Keine Einleitung, direkt zur Antwort.",
      [{ role: "user", content: question.trim() }],
      350
    );

    return res.status(200).json({ answer });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message || "Unbekannter Fehler." });
  }
}

import { requireUser } from "../../lib/supabaseServer";
import { callAI } from "../../lib/aiClient";

// Etwas mehr Zeit für Gemini-Wiederholungsversuche bei 429/503-Fehlern.
export const config = { maxDuration: 45 };

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const auth = await requireUser(req, res);
  if (!auth) return;

  try {
    const { question } = req.body;
    if (!question || !question.trim()) return res.status(400).json({ error: "Frage fehlt." });

    const answer = await callAI(
      "Du bist ein erfahrener Vertriebscoach. Beantworte die folgende kurze Verkaufsfrage knapp, praktisch und konkret (maximal 4-5 Sätze), auf Deutsch. Keine Einleitung, direkt zur Antwort. " +
        "Absolut verboten in deiner Antwort: (1) eine Selbstvorstellung mit Namen und/oder Firma (z.B. „Ich bin [Name] von [Firma]“) als empfohlener Gesprächseinstieg — das Gespräch soll NICHT mit einer Personen-/Firmenvorstellung beginnen; (2) eine Preisreduzierung/ein Rabatt als Lösung. Das Ziel ist kein klassisches Verkaufsgespräch, sondern ein sympathisches, echtes Gespräch — Sympathie und persönliche Verbindung stehen im Vordergrund, nicht Fakten oder Preisnachlässe.",
      [{ role: "user", content: question.trim() }],
      350
    );

    return res.status(200).json({ answer });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message || "Unbekannter Fehler." });
  }
}

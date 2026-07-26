import { requireUser } from "../../lib/supabaseServer";
import { callAI } from "../../lib/aiClient";
import { PERSONAS, SCENARIOS, DIFFICULTY, PRINCIPLE_LIST } from "../../lib/personas";

// IMPORTANT: this route runs server-side (Vercel serverless function).
// The Gemini API key lives only in process.env.GEMINI_API_KEY here —
// it is never sent to or exposed in the browser.

function systemPromptFor(persona, scenarioId, difficulty) {
  const sc = SCENARIOS.find((s) => s.id === scenarioId);
  const diff = DIFFICULTY[difficulty] || DIFFICULTY.fortgeschritten;
  return (
    persona.base + " " + sc.context + diff.suffix +
    " Antworte kurz, realistisch, ein bis zwei Sätze, auf Deutsch. Bleibe konsequent in der Rolle, du bist NICHT der Assistent, sondern der Kunde. Gib niemals zu erkennen, dass du eine KI bist."
  );
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const auth = await requireUser(req, res);
  if (!auth) return;

  if (!process.env.GEMINI_API_KEY) {
    return res.status(500).json({ error: "GEMINI_API_KEY ist auf dem Server nicht gesetzt. Siehe README." });
  }

  try {
    const { personaId, scenarioId, difficulty, history, message } = req.body;
    const persona = PERSONAS.find((p) => p.id === personaId);
    if (!persona) return res.status(400).json({ error: "Unbekannte Persona." });

    const apiMessages = [...(history || []), { role: "user", content: message }];

    const [replyText, detectRaw] = await Promise.all([
      callAI(systemPromptFor(persona, scenarioId, difficulty), apiMessages, 300),
      callAI(
        "Analysiere NUR die folgende einzelne Verkäufer-Nachricht. Gib ausschließlich ein valides JSON-Array von Strings zurück mit erkennbar verwendeten Prinzipien aus dieser Liste: " +
          JSON.stringify(PRINCIPLE_LIST) +
          ". Falls keines eindeutig erkennbar ist, gib [] zurück. Keine Erklärung, nur das JSON-Array.",
        [{ role: "user", content: message }],
        150
      ),
    ]);

    let detected = [];
    try {
      const parsed = JSON.parse(detectRaw.replace(/```json|```/g, "").trim());
      if (Array.isArray(parsed)) detected = parsed;
    } catch (e) {
      detected = [];
    }

    return res.status(200).json({ reply: replyText || "...", detected });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message || "Unbekannter Fehler." });
  }
}

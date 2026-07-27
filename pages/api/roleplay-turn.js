import { requireUser } from "../../lib/supabaseServer";
import { callAI } from "../../lib/aiClient";
import { PERSONAS, SCENARIOS, DIFFICULTY, PRINCIPLE_LIST } from "../../lib/personas";

// Etwas mehr Zeit für Gemini-Wiederholungsversuche bei 429/503-Fehlern.
export const config = { maxDuration: 45 };

// IMPORTANT: this route runs server-side (Vercel serverless function).
// The Gemini API key lives only in process.env.GEMINI_API_KEY here —
// it is never sent to or exposed in the browser.
//
// Persona-Antwort und Prinzipien-Erkennung laufen in EINER Anfrage statt zwei
// parallelen — das halbiert den Verbrauch des kostenlosen Anfragen-Kontingents.

function systemPromptFor(persona, scenarioId, difficulty) {
  const sc = SCENARIOS.find((s) => s.id === scenarioId);
  const diff = DIFFICULTY[difficulty] || DIFFICULTY.fortgeschritten;
  return (
    persona.base + " " + sc.context + diff.suffix +
    " Antworte als der Kunde, kurz, realistisch, ein bis zwei Sätze, auf Deutsch. Bleibe konsequent in der Rolle, du bist NICHT der Assistent, sondern der Kunde. Gib niemals zu erkennen, dass du eine KI bist." +
    " Analysiere zusätzlich NUR die letzte Nachricht des Verkäufers (die letzte 'user'-Nachricht) auf erkennbar verwendete Überzeugungsprinzipien aus dieser Liste: " +
    JSON.stringify(PRINCIPLE_LIST) +
    ". Antworte AUSSCHLIESSLICH als valides JSON-Objekt, kein Text davor oder danach: " +
    '{"reply": "<deine Antwort als Kunde>", "detected": [<Liste erkannter Prinzipien aus der Liste oben, leeres Array falls keines eindeutig erkennbar>]}'
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

    const raw = await callAI(systemPromptFor(persona, scenarioId, difficulty), apiMessages, 400);

    let reply = "...";
    let detected = [];
    try {
      const parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
      reply = parsed.reply || reply;
      if (Array.isArray(parsed.detected)) detected = parsed.detected;
    } catch (e) {
      // Falls das Modell doch mal kein reines JSON liefert, den Rohtext als Antwort nehmen.
      reply = raw || reply;
    }

    return res.status(200).json({ reply, detected });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message || "Unbekannter Fehler." });
  }
}

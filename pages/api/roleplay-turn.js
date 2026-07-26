import { requireUser } from "../../lib/supabaseServer";
import { PERSONAS, SCENARIOS, DIFFICULTY, PRINCIPLE_LIST } from "../../lib/personas";

// IMPORTANT: this route runs server-side (Vercel serverless function).
// The Anthropic API key lives only in process.env.ANTHROPIC_API_KEY here —
// it is never sent to or exposed in the browser. Calling api.anthropic.com
// directly from client-side JS (as the previous prototype did) cannot work:
// there is no key available in the browser and the request would be blocked
// by CORS even if there were. This route is the actual fix.

async function callClaude(system, messages, maxTokens) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: maxTokens,
      system,
      messages,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error("Anthropic API error " + res.status + ": " + text);
  }
  return res.json();
}

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

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: "ANTHROPIC_API_KEY ist auf dem Server nicht gesetzt. Siehe README." });
  }

  try {
    const { personaId, scenarioId, difficulty, history, message } = req.body;
    const persona = PERSONAS.find((p) => p.id === personaId);
    if (!persona) return res.status(400).json({ error: "Unbekannte Persona." });

    const apiMessages = [...(history || []), { role: "user", content: message }];

    const [replyData, detectData] = await Promise.all([
      callClaude(systemPromptFor(persona, scenarioId, difficulty), apiMessages, 300),
      callClaude(
        "Analysiere NUR die folgende einzelne Verkäufer-Nachricht. Gib ausschließlich ein valides JSON-Array von Strings zurück mit erkennbar verwendeten Prinzipien aus dieser Liste: " +
          JSON.stringify(PRINCIPLE_LIST) +
          ". Falls keines eindeutig erkennbar ist, gib [] zurück. Keine Erklärung, nur das JSON-Array.",
        [{ role: "user", content: message }],
        150
      ),
    ]);

    const replyText = (replyData.content || []).filter((c) => c.type === "text").map((c) => c.text).join("\n") || "...";

    let detected = [];
    try {
      const raw = (detectData.content || []).filter((c) => c.type === "text").map((c) => c.text).join("");
      const parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
      if (Array.isArray(parsed)) detected = parsed;
    } catch (e) {
      detected = [];
    }

    return res.status(200).json({ reply: replyText, detected });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message || "Unbekannter Fehler." });
  }
}

import { requireUser } from "../../lib/supabaseServer";
import { callAIWithAudio, spracheErzeugen } from "../../lib/aiClient";
import { pcmZuWav, rateAusMime } from "../../lib/wav";
import { PERSONAS, SCENARIOS, DIFFICULTY, PRINCIPLE_LIST } from "../../lib/personas";

// Ein Gesprächszug per Sprache: aufgenommenes Audio rein, Antwort des Kunden
// als Text UND als Stimme zurück.
//
// Warum über den Server und nicht im Browser: Die Spracherkennung des
// Browsers gibt es nur in Chrome und Edge, und sie schickt die Stimme an
// Google-Dienste, über die wir nichts sagen können. Hier geht die Aufnahme
// an denselben KI-Dienst, der ohnehin antwortet — ein Weg, ein Anbieter,
// derselbe Schlüssel, der den Browser nie verlässt.
//
// Die Aufnahme wird NICHT gespeichert. Sie lebt für die Dauer dieser einen
// Anfrage; danach bleibt nur das, was auch beim Tippen entstünde: Text.
export const config = {
  api: { bodyParser: { sizeLimit: "12mb" } },
  maxDuration: 60,
};

function systemPromptFor(persona, scenarioId, difficulty) {
  const sc = SCENARIOS.find((s) => s.id === scenarioId);
  const diff = DIFFICULTY[difficulty] || DIFFICULTY.fortgeschritten;
  return (
    persona.base + " " + sc.context + diff.suffix +
    " Du führst ein TELEFONAT. Antworte als der Kunde, kurz und gesprochen, ein bis zwei Sätze, auf Deutsch." +
    " Schreibe so, wie man spricht — keine Aufzählungen, keine Sternchen, keine Emojis, denn deine Antwort wird vorgelesen." +
    " Bleibe konsequent in der Rolle, du bist NICHT der Assistent, sondern der Kunde. Gib niemals zu erkennen, dass du eine KI bist." +
    " Die beigefügte Audiodatei ist das, was der Verkäufer gerade gesagt hat." +
    " Schreibe es zunächst wörtlich auf (transkript) und antworte dann darauf." +
    " Analysiere zusätzlich NUR dieses Gesagte auf erkennbar verwendete Überzeugungsprinzipien aus dieser Liste: " +
    JSON.stringify(PRINCIPLE_LIST) +
    ". Antworte AUSSCHLIESSLICH als valides JSON-Objekt, kein Text davor oder danach: " +
    '{"transkript": "<was der Verkäufer gesagt hat>", "reply": "<deine Antwort als Kunde>", "detected": [<erkannte Prinzipien, sonst leeres Array>]}'
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
    const { personaId, scenarioId, difficulty, history, audio, mimeType } = req.body || {};
    const persona = PERSONAS.find((p) => p.id === personaId);
    if (!persona) return res.status(400).json({ error: "Unbekannte Persona." });
    if (!audio) return res.status(400).json({ error: "Keine Aufnahme übermittelt." });

    // Der bisherige Verlauf als Text, damit der Kunde sich an das Gespräch
    // erinnert — das Audio enthält ja nur den letzten Satz.
    const verlauf = (history || [])
      .map((m) => `${m.role === "assistant" ? persona.name : "Verkäufer"}: ${m.content}`)
      .join("\n");
    const prompt = verlauf
      ? `Bisheriges Telefonat:\n${verlauf}\n\nDer Verkäufer sagt jetzt (siehe Audio):`
      : "Der Verkäufer eröffnet das Telefonat (siehe Audio):";

    const roh = await callAIWithAudio(systemPromptFor(persona, scenarioId, difficulty), prompt, audio, mimeType || "audio/webm", 600);

    let transkript = "";
    let reply = "...";
    let detected = [];
    try {
      const parsed = JSON.parse(roh.replace(/```json|```/g, "").trim());
      transkript = String(parsed.transkript || "").trim();
      reply = String(parsed.reply || "").trim() || "...";
      detected = Array.isArray(parsed.detected) ? parsed.detected : [];
    } catch (e) {
      // Kein sauberes JSON: lieber die rohe Antwort zeigen als gar nichts.
      reply = roh.trim() || "...";
    }

    // Stimme dazu — bewusst "best effort": klappt es nicht, spricht der
    // Browser den Text selbst (siehe pages/roleplay.js).
    let stimme = null;
    const ton = await spracheErzeugen(reply);
    if (ton?.base64) {
      const wav = pcmZuWav(ton.base64, rateAusMime(ton.mime));
      stimme = `data:audio/wav;base64,${wav.toString("base64")}`;
    }

    return res.status(200).json({ transkript, reply, detected, stimme });
  } catch (e) {
    console.error("Sprach-Rollenspiel fehlgeschlagen:", e.message);
    return res.status(500).json({ error: e.message || "Der Zug konnte nicht verarbeitet werden." });
  }
}

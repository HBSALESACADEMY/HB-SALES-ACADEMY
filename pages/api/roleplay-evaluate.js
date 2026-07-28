import { requireUser } from "../../lib/supabaseServer";
import { callAI } from "../../lib/aiClient";

// Etwas mehr Zeit für Gemini-Wiederholungsversuche bei 429/503-Fehlern.
export const config = { maxDuration: 45 };

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const auth = await requireUser(req, res);
  if (!auth) return;
  if (!process.env.GEMINI_API_KEY) return res.status(500).json({ error: "GEMINI_API_KEY fehlt." });

  try {
    const { personaId, scenarioId, difficulty, messages, detected } = req.body;
    const transcript = messages.map((m) => (m.role === "user" ? "Verkäufer" : "Kunde") + ": " + m.content).join("\n");

    // Bewertung UND ein optionaler Wissensdatenbank-Vorschlag laufen in EINEM Aufruf,
    // um das kostenlose Anfragen-Kontingent zu schonen.
    const raw = await callAI(
      "Du bist ein Trainer für Verkaufspsychologie. Bewerte das folgende Verkaufsgespräch auf Deutsch, konstruktiv und konkret. " +
        "Prüfe zusätzlich, ob der Verkäufer eine bemerkenswerte, spezifische Technik oder einen ungewöhnlichen Einwand gezeigt hat, der es wert wäre, als kurzer Lerneintrag in eine Wissensdatenbank aufgenommen zu werden (nur bei echtem Mehrwert, sonst null). " +
        "Nenne außerdem zu den Verbesserungspunkten passende, konkrete Beispielsätze — wörtliche Formulierungen, die der Verkäufer an der jeweiligen Stelle im Gespräch hätte sagen können, statt nur abstrakt zu beschreiben was besser gewesen wäre. " +
        "ABSOLUT VERBOTEN in Verbesserungspunkten und Beispielsätzen: (1) eine Selbstvorstellung mit Namen " +
        "und/oder Firma in irgendeiner Formulierung (z.B. „Ich bin [Name] von [Firma]“) als empfohlener Einstieg " +
        "— das Gespräch soll NICHT mit einer Personen- oder Firmenvorstellung beginnen; (2) eine Preisreduzierung, " +
        "ein Rabatt oder Nachlass als Verbesserung oder Einwandbehandlung. Das Ziel ist KEIN klassisches " +
        "Verkaufsgespräch, sondern ein sympathisches, echtes Gespräch — gute Beispielsätze bauen Neugier, Sympathie " +
        "und eine persönliche Verbindung zum Kunden auf, statt mit Fakten, Rabatten oder Standardfloskeln zu arbeiten. " +
        "Antworte AUSSCHLIESSLICH als valides JSON-Objekt mit den Feldern: " +
        '{"score": <Zahl 0-100>, "staerken": [<max 3 kurze Punkte>], "verbesserung": [<max 3 kurze Punkte>], ' +
        '"beispielsaetze": [{"moment": "<kurzer Kontext, an welcher Stelle im Gespräch>", "satz": "<wörtlicher Beispielsatz>"} , max 3], ' +
        '"zusammenfassung": "<2-3 Sätze>", "kbSuggestion": {"tag": "<kurzes Schlagwort>", "title": "<kurzer Titel>", "body": "<1-2 Sätze Lerninhalt>"} oder null}. Kein Text außerhalb des JSON.',
      [{ role: "user", content: transcript }],
      800
    );

    let evaluation;
    try {
      evaluation = JSON.parse(raw.replace(/```json|```/g, "").trim());
    } catch (e) {
      evaluation = { score: null, staerken: [], verbesserung: [], beispielsaetze: [], zusammenfassung: raw, kbSuggestion: null };
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
      evaluation_detail: { staerken: evaluation.staerken || [], verbesserung: evaluation.verbesserung || [], beispielsaetze: evaluation.beispielsaetze || [] },
    });
    if (insertError) console.error("insert roleplay_sessions failed:", insertError.message);

    if (evaluation.kbSuggestion && evaluation.kbSuggestion.title && evaluation.kbSuggestion.body) {
      const { error: kbError } = await auth.client.from("kb_entries").insert({
        tag: evaluation.kbSuggestion.tag || "Sonstiges",
        title: evaluation.kbSuggestion.title,
        body: evaluation.kbSuggestion.body,
        status: "pending",
        source: "ai_roleplay",
        created_by: auth.user.id,
      });
      if (kbError) console.error("insert kb_entries failed:", kbError.message);
    }

    const xpGain = 30;
    try { await auth.client.rpc("increment_xp", { uid: auth.user.id, amount: xpGain }); } catch (e) { console.error("increment_xp failed:", e.message); }

    return res.status(200).json({ evaluation });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message || "Unbekannter Fehler." });
  }
}

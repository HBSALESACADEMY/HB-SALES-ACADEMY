import { requireUser } from "../../lib/supabaseServer";
import { callAI } from "../../lib/aiClient";
import { GOAL_METRICS } from "../../lib/goalMetrics";

// Übersetzt ein frei formuliertes Ziel in eine messbare Größe.
//
// "3 neue Kunden gewinnen" → Kennzahl "kunden", Zielwert 3.
//
// Bewusst EINMAL beim Anlegen, nicht laufend: danach zählt das System ganz
// normal weiter. Das ist nachvollziehbar, kostet nichts im Betrieb und
// liefert bei jedem Blick dieselbe Zahl — eine KI, die jedes Mal neu
// urteilt, täte das nicht.
//
// Findet sie nichts Passendes, lehnt sie ab und nennt, was sie stattdessen
// zählen könnte. Lieber eine ehrliche Rückfrage als ein Ziel, das eine
// Kennzahl misst, die niemand gemeint hat.
export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const auth = await requireUser(req, res);
  if (!auth) return;

  const text = (req.body?.text || "").trim();
  if (!text) return res.status(400).json({ error: "Bitte beschreibe dein Ziel." });
  if (text.length > 300) return res.status(400).json({ error: "Bitte kürzer fassen — ein Satz genügt." });

  const liste = GOAL_METRICS.map((m) => `- ${m.key}: ${m.label} (${m.gruppe})`).join("\n");

  const system = `Du ordnest ein frei formuliertes Vertriebsziel einer messbaren Kennzahl zu.

Verfügbare Kennzahlen:
${liste}

Antworte AUSSCHLIESSLICH mit JSON, ohne Fliesstext und ohne Code-Zaun.

Passt das Ziel zu einer Kennzahl:
{"ok":true,"metric":"<schluessel>","target":<ganze Zahl>,"title":"<kurzer Titel, max 60 Zeichen>"}

Passt es zu keiner:
{"ok":false,"grund":"<ein Satz, warum das so nicht messbar ist>","vorschlaege":["<schluessel>","<schluessel>"]}

Regeln:
- "target" ist die Zahl aus dem Text. Fehlt sie, wähle einen plausiblen Wert und nenne ihn im Titel.
- Zähle nur, was in der Liste steht. Erfinde keine Kennzahlen.
- Ziele ohne Zählbarkeit (z.B. "besser zuhören", "Preisliste fertigstellen") sind ok:false.
- Antworte auf Deutsch.`;

  try {
    const roh = await callAI(system, [{ role: "user", content: text }], 300);
    const sauber = String(roh || "").replace(/```json|```/g, "").trim();
    let antwort;
    try {
      antwort = JSON.parse(sauber.slice(sauber.indexOf("{"), sauber.lastIndexOf("}") + 1));
    } catch {
      return res.status(200).json({ ok: false, grund: "Die Antwort war nicht auswertbar. Bitte formuliere das Ziel etwas einfacher." });
    }

    if (antwort.ok) {
      // Nie ungeprüft übernehmen: die KI könnte einen Schlüssel erfinden.
      const gefunden = GOAL_METRICS.find((m) => m.key === antwort.metric);
      const ziel = Math.max(1, Math.round(Number(antwort.target) || 0));
      if (!gefunden || !ziel) {
        return res.status(200).json({ ok: false, grund: "Daraus liess sich keine zählbare Größe ableiten. Bitte nenne eine Zahl und was gezählt werden soll." });
      }
      return res.status(200).json({
        ok: true,
        metric: gefunden.key,
        metricLabel: gefunden.label,
        target: ziel,
        title: String(antwort.title || text).slice(0, 60),
      });
    }

    const vorschlaege = (antwort.vorschlaege || [])
      .map((k) => GOAL_METRICS.find((m) => m.key === k)?.label)
      .filter(Boolean);
    return res.status(200).json({ ok: false, grund: antwort.grund || "Das lässt sich so nicht messen.", vorschlaege });
  } catch (e) {
    console.error("Ziel-Deutung fehlgeschlagen:", e.message);
    return res.status(500).json({ error: "Die Deutung ist fehlgeschlagen. Wähle die Kennzahl bitte von Hand." });
  }
}

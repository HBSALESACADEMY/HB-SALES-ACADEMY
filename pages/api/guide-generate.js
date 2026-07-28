import { requireUser } from "../../lib/supabaseServer";
import { callAI } from "../../lib/aiClient";

// Etwas mehr Zeit für Gemini-Wiederholungsversuche bei 429/503-Fehlern.
export const config = { maxDuration: 45 };

const TYPE_LABELS = { cold_call: "Kaltakquise-Anruf (Erstkontakt, unbekannter Kunde)", closing_call: "Abschluss-Anruf (Kunde kennt das Angebot bereits, es geht um den Abschluss)" };

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const auth = await requireUser(req, res);
  if (!auth) return;
  if (!process.env.GEMINI_API_KEY) return res.status(500).json({ error: "GEMINI_API_KEY fehlt." });

  try {
    const { type, produkt, zielgruppe, kontext } = req.body;
    if (!["cold_call", "closing_call"].includes(type)) return res.status(400).json({ error: "Ungültiger Typ." });
    if (!produkt?.trim() || !zielgruppe?.trim()) return res.status(400).json({ error: "Produkt/Angebot und Zielgruppe sind Pflichtfelder." });

    const userPrompt =
      `Anruftyp: ${TYPE_LABELS[type]}\n` +
      `Produkt/Angebot: ${produkt.trim()}\n` +
      `Zielgruppe: ${zielgruppe.trim()}\n` +
      (kontext?.trim() ? `Zusätzlicher Kontext: ${kontext.trim()}\n` : "");

    const raw = await callAI(
      "Du hilfst Vertriebler:innen, einen individuellen GesprächsLEITFADEN für einen Telefonanruf zu entwerfen. " +
        "Das Ziel ist AUSDRÜCKLICH KEIN klassisches Verkaufsgespräch, sondern ein sympathisches, echtes, " +
        "persönliches Gespräch — der Kunde soll sich zu keinem Zeitpunkt 'verkauft' fühlen. " +
        "Das ist außerdem KEIN Skript zum wörtlichen Ablesen — schreibe keine kompletten, vorgefertigten Sätze, " +
        "sondern eine Orientierung: pro Phase ein klares Ziel und knappe Stichpunkte (Fragen, Themen, worauf man " +
        "achten sollte), die der/die Vertriebler:in in eigenen Worten nutzt. 4 bis 6 Phasen, passend zum Anruftyp. " +
        "ABSOLUT VERBOTEN, in KEINER Phase und KEINEM Stichpunkt: " +
        "(1) eine Selbstvorstellung mit Namen und/oder Firma, egal in welcher Formulierung (z.B. „Ich bin [Name] " +
        "von [Firma]“, „Stellen Sie sich mit Namen und Unternehmen vor“, „Firma nennen“) — das Gespräch beginnt " +
        "NICHT mit einer Personen- oder Firmenvorstellung; " +
        "(2) eine Preisreduzierung, ein Rabatt oder Nachlass als Vorschlag oder Einwandbehandlung; " +
        "(3) aufdringliche Verkaufstechniken oder Verkaufsjargon. " +
        "Die erste Phase (Einstieg) baut stattdessen auf echter Neugier und Sympathie auf: ein Bezug zur Situation " +
        "des Angerufenen, eine ehrliche unaufdringliche Frage, echtes Interesse am Gegenüber. Firma/Produkt kommen " +
        "— falls überhaupt nötig — erst später, beiläufig, nie als Aufhänger. Verkauft wird grundsätzlich auf der " +
        "emotionalen Ebene: alle Stichpunkte sollen Sympathie und Vertrauen aufbauen, bevor es um Fakten, " +
        "Produktdetails oder Preis geht. " +
        "Bleib produktneutral und konkret auf das genannte Produkt und die Zielgruppe bezogen, auf Deutsch. " +
        "Antworte AUSSCHLIESSLICH als valides JSON-Objekt: " +
        '{"title": "<kurzer, konkreter Titel>", "phasen": [{"phase": "<Phasenname>", "ziel": "<1 Satz Ziel dieser Phase>", "punkte": [<max 4 kurze Stichpunkte>]}]}. ' +
        "Kein Text außerhalb des JSON.",
      [{ role: "user", content: userPrompt }],
      1000
    );

    let content;
    try {
      content = JSON.parse(raw.replace(/```json|```/g, "").trim());
    } catch (e) {
      content = { title: `${TYPE_LABELS[type]} — ${produkt.trim()}`, phasen: [{ phase: "Leitfaden", ziel: "", punkte: [raw] }] };
    }

    const { data, error } = await auth.client
      .from("guides")
      .insert({
        type,
        title: content.title || `${TYPE_LABELS[type]} — ${produkt.trim()}`,
        input: { produkt: produkt.trim(), zielgruppe: zielgruppe.trim(), kontext: kontext?.trim() || null },
        content: { phasen: content.phasen || [] },
        created_by: auth.user.id,
      })
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });

    return res.status(200).json({ guide: data });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message || "Unbekannter Fehler." });
  }
}

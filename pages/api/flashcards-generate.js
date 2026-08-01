import { requireUser } from "../../lib/supabaseServer";
import { callAI } from "../../lib/aiClient";
import { COURSES } from "../../lib/curriculum";

// Etwas mehr Zeit für Gemini-Wiederholungsversuche bei 429/503-Fehlern.
export const config = { maxDuration: 45 };

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const auth = await requireUser(req, res);
  if (!auth) return;
  const { client, user } = auth;

  const { data: me } = await client.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (!me || (me.role !== "manager" && me.role !== "trainer")) {
    return res.status(403).json({ error: "Nur Manager und Trainer können Flashcards generieren." });
  }
  if (!process.env.GEMINI_API_KEY) return res.status(500).json({ error: "GEMINI_API_KEY fehlt." });

  const { courseId } = req.body || {};
  const course = COURSES.find((c) => c.id === courseId);
  if (!course) return res.status(400).json({ error: "Unbekannter Kurs." });

  try {
    const moduleText = course.modules.map((m) => `### ${m.title}\n${m.theory}`).join("\n\n");

    const raw = await callAI(
      "Du erstellst Lernkarten (Flashcards) für ein Vertriebstraining, auf Basis von Kursinhalten. " +
        "Der Nutzer schickt dir mehrere Modul-Abschnitte (jeweils mit ### eingeleitet). Erzeuge pro Abschnitt " +
        "GENAU 2 Karten: je eine kurze, konkrete Frage (front) und eine knappe, präzise Antwort (back, 1-2 Sätze). " +
        "Keine Ja/Nein-Fragen — die Fragen sollen echtes Verständnis prüfen (Begriffe, Zusammenhänge, Anwendung " +
        "im Verkaufsgespräch), nicht nur Textstellen wiederholen. tag = der jeweilige Modultitel, exakt wie in " +
        "der ### Überschrift angegeben. Antworte AUSSCHLIESSLICH als valides JSON-Array, auf Deutsch: " +
        '[{"tag": "<Modultitel>", "front": "<Frage>", "back": "<Antwort>"}, ...]. Kein Text außerhalb des JSON.',
      [{ role: "user", content: moduleText }],
      1600
    );

    let cards;
    try {
      cards = JSON.parse(raw.replace(/```json|```/g, "").trim());
    } catch (e) {
      return res.status(500).json({ error: "Die KI-Antwort konnte nicht gelesen werden. Bitte erneut versuchen." });
    }
    if (!Array.isArray(cards) || !cards.length) {
      return res.status(500).json({ error: "Keine Karten generiert. Bitte erneut versuchen." });
    }

    const rows = cards
      .filter((c) => c?.front?.trim() && c?.back?.trim())
      .map((c) => ({ tag: (c.tag || course.title).trim(), front: c.front.trim(), back: c.back.trim(), created_by: user.id }));

    const { data, error } = await client.from("flashcards").insert(rows).select();
    if (error) return res.status(500).json({ error: error.message });

    return res.status(200).json({ cards: data });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message || "Unbekannter Fehler." });
  }
}

import { requireUser } from "../../lib/supabaseServer";
import { callAI } from "../../lib/aiClient";
import { COURSES } from "../../lib/curriculum";

// Etwas mehr Zeit für Gemini-Wiederholungsversuche bei 429/503-Fehlern.
export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const auth = await requireUser(req, res);
  if (!auth) return;
  if (!process.env.GEMINI_API_KEY) return res.status(500).json({ error: "GEMINI_API_KEY fehlt." });

  try {
    const { courseId, moduleId, answerText, mcScore, mcTotal } = req.body;
    const course = COURSES.find((c) => c.id === courseId);
    const mod = course && course.modules.find((m) => m.id === moduleId);
    if (!mod || !mod.open) return res.status(400).json({ error: "Modul/Frage nicht gefunden." });

    const raw = await callAI(
      "Du bist ein strenger, aber fairer Trainer für Verkaufspsychologie. Du bewertest die Antwort eines Vertrieblers auf eine offene Fallstudien-Frage. " +
        "Bewertungskriterien (Rubrik): " + JSON.stringify(mod.open.keyPoints) + ". " +
        "Antworte AUSSCHLIESSLICH als valides JSON-Objekt: " +
        '{"score": <Zahl 0-100>, "feedback": "<3-5 Sätze konstruktives Feedback auf Deutsch, was gut war und was fehlt>", "erfuellteKriterien": [<Liste der erfüllten Kriterien aus der Rubrik, als kurze Strings>]}. ' +
        "Kein Text außerhalb des JSON.",
      [{ role: "user", content: "Frage: " + mod.open.prompt + "\n\nAntwort des Vertrieblers: " + answerText }],
      500
    );

    let grading;
    try {
      grading = JSON.parse(raw.replace(/```json|```/g, "").trim());
    } catch (e) {
      grading = { score: 50, feedback: raw, erfuellteKriterien: [] };
    }

    const { error: insertError } = await auth.client.from("quiz_results").insert({
      user_id: auth.user.id,
      course_id: courseId,
      module_id: moduleId,
      mc_score: mcScore,
      mc_total: mcTotal,
      open_score: grading.score,
      open_total: 100,
      open_feedback: grading,
    });
    if (insertError) console.error("insert quiz_results failed:", insertError.message);

    try { await auth.client.rpc("increment_xp", { uid: auth.user.id, amount: 25 }); } catch (e) { console.error("increment_xp failed:", e.message); }

    return res.status(200).json({ grading });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message || "Unbekannter Fehler." });
  }
}

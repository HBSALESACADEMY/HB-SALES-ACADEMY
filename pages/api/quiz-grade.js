import { requireUser } from "../../lib/supabaseServer";
import { getAdminSupabase } from "../../lib/supabaseAdmin";
import { callAI } from "../../lib/aiClient";
import { resolveCourse } from "../../lib/resolveCourse";

// Etwas mehr Zeit für Gemini-Wiederholungsversuche bei 429/503-Fehlern.
export const config = { maxDuration: 45 };

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const auth = await requireUser(req, res);
  if (!auth) return;
  if (!process.env.GEMINI_API_KEY) return res.status(500).json({ error: "GEMINI_API_KEY fehlt." });

  try {
    const { courseId, moduleId, answerText, answers } = req.body;
    const course = await resolveCourse(courseId, getAdminSupabase());
    const mod = course && course.modules.find((m) => m.id === moduleId);
    if (!mod || !mod.open) return res.status(400).json({ error: "Modul/Frage nicht gefunden." });

    // Server rechnet das MC-Ergebnis selbst aus den eingereichten Antworten
    // nach — der Client darf mcScore/mcTotal nicht selbst vorgeben, sonst
    // ließen sich Lernpfad-Auswertung und Statistiken fälschen.
    const correctByQuestion = {};
    (mod.mc || []).forEach((q) => { correctByQuestion[q.q] = q.options[q.correct]; });
    const answeredQuestions = new Set();
    let mcScore = 0;
    (Array.isArray(answers) ? answers : []).forEach((a) => {
      if (!a || typeof a.q !== "string" || answeredQuestions.has(a.q) || !(a.q in correctByQuestion)) return;
      answeredQuestions.add(a.q);
      if (a.selected === correctByQuestion[a.q]) mcScore += 1;
    });
    const mcTotal = (mod.mc || []).length;

    const raw = await callAI(
      "Du bist ein strenger, aber fairer Trainer für Verkaufspsychologie. Du bewertest die Antwort eines Vertrieblers auf eine offene Fallstudien-Frage. " +
        "Bewertungskriterien (Rubrik): " + JSON.stringify(mod.open.keyPoints) + ". " +
        "Antworte AUSSCHLIESSLICH als valides JSON-Objekt: " +
        '{"score": <Zahl 0-100>, "feedback": "<3-5 Sätze konstruktives Feedback auf Deutsch, was gut war und was fehlt>", ' +
        '"erfuellteKriterien": [<Liste der erfüllten Kriterien, wörtlich aus der Rubrik übernommen>], ' +
        '"fehlendeKriterien": [<Liste der NICHT erfüllten Kriterien, wörtlich aus der Rubrik übernommen — konkret das, was für 100% noch fehlt>]}. ' +
        "Kein Text außerhalb des JSON.",
      [{ role: "user", content: "Frage: " + mod.open.prompt + "\n\nAntwort des Vertrieblers: " + answerText }],
      600
    );

    let grading;
    try {
      grading = JSON.parse(raw.replace(/```json|```/g, "").trim());
    } catch (e) {
      grading = { score: 50, feedback: raw, erfuellteKriterien: [], fehlendeKriterien: [] };
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

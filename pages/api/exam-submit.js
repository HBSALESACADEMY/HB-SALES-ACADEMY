import { requireUser } from "../../lib/supabaseServer";
import { callAI } from "../../lib/aiClient";
import { COURSES } from "../../lib/curriculum";

// Etwas mehr Zeit für Gemini-Wiederholungsversuche bei 429/503-Fehlern.
export const config = { maxDuration: 45 };

// Pass rule: MC score >= 80% AND capstone open-answer score >= 60.
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const auth = await requireUser(req, res);
  if (!auth) return;
  if (!process.env.GEMINI_API_KEY) return res.status(500).json({ error: "GEMINI_API_KEY fehlt." });

  try {
    const { courseId, mcScore, mcTotal, capstoneAnswer } = req.body;
    const course = COURSES.find((c) => c.id === courseId);
    if (!course || !course.examCase) return res.status(400).json({ error: "Kurs nicht gefunden." });

    const raw = await callAI(
      "Du bist ein strenger, aber fairer Trainer für Verkaufspsychologie und bewertest die Abschlussfallstudie einer Kursprüfung. " +
        "Bewertungskriterien: " + JSON.stringify(course.examCase.keyPoints) + ". " +
        'Antworte AUSSCHLIESSLICH als valides JSON: {"score": <0-100>, "feedback": "<3-5 Sätze>"}',
      [{ role: "user", content: "Frage: " + course.examCase.prompt + "\n\nAntwort: " + capstoneAnswer }],
      500
    );
    let grading;
    try { grading = JSON.parse(raw.replace(/```json|```/g, "").trim()); }
    catch (e) { grading = { score: 50, feedback: raw }; }

    const mcPct = mcTotal > 0 ? (mcScore / mcTotal) * 100 : 0;
    const passed = mcPct >= 80 && grading.score >= 60;
    const combinedScore = Math.round((mcPct * 0.6) + (grading.score * 0.4));

    const { error: insertError } = await auth.client.from("exam_results").insert({
      user_id: auth.user.id,
      course_id: courseId,
      score: combinedScore,
      total: 100,
      passed,
    });
    if (insertError) console.error("insert exam_results failed:", insertError.message);

    try { await auth.client.rpc("increment_xp", { uid: auth.user.id, amount: passed ? 150 : 30 }); } catch (e) { console.error("increment_xp failed:", e.message); }

    return res.status(200).json({ passed, combinedScore, mcPct: Math.round(mcPct), capstoneGrading: grading });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message || "Unbekannter Fehler." });
  }
}

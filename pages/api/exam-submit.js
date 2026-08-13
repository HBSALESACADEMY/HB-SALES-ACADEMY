import { requireUser } from "../../lib/supabaseServer";
import { getAdminSupabase } from "../../lib/supabaseAdmin";
import { callAI } from "../../lib/aiClient";
import { resolveCourse } from "../../lib/resolveCourse";
import { notifyOrgManagers } from "../../lib/notifyManagers";
import { allMcQuestionsOfCourse } from "../../lib/curriculum";

// Multiple-Choice-Ergebnis serverseitig aus den tatsächlich eingereichten
// Antworten nachrechnen — der Client darf mcScore/mcTotal NICHT selbst
// vorgeben, sonst ließe sich per manipuliertem Request jede Prüfung (und
// damit Zertifikat + XP) fälschen. Jede Frage zählt höchstens einmal.
function gradeMc(course, answers) {
  const questions = allMcQuestionsOfCourse(course);
  const correctByQuestion = {};
  questions.forEach((q) => { correctByQuestion[q.q] = q.options[q.correct]; });
  const answered = new Set();
  let score = 0;
  (Array.isArray(answers) ? answers : []).forEach((a) => {
    if (!a || typeof a.q !== "string" || answered.has(a.q) || !(a.q in correctByQuestion)) return;
    answered.add(a.q);
    if (a.selected === correctByQuestion[a.q]) score += 1;
  });
  return { mcScore: score, mcTotal: questions.length };
}

// Etwas mehr Zeit für Gemini-Wiederholungsversuche bei 429/503-Fehlern.
export const config = { maxDuration: 45 };

// Pass rule: MC score >= 80% AND capstone open-answer score >= 60.
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const auth = await requireUser(req, res);
  if (!auth) return;
  if (!process.env.GEMINI_API_KEY) return res.status(500).json({ error: "GEMINI_API_KEY fehlt." });

  try {
    const { courseId, answers, capstoneAnswer } = req.body;
    const admin = getAdminSupabase();
    const course = await resolveCourse(courseId, admin);
    if (!course || !course.examCase) return res.status(400).json({ error: "Kurs nicht gefunden." });
    const { mcScore, mcTotal } = gradeMc(course, answers);

    const raw = await callAI(
      "Du bist ein strenger, aber fairer Trainer für Verkaufspsychologie und bewertest die Abschlussfallstudie einer Kursprüfung. " +
        "Bewertungskriterien (Rubrik): " + JSON.stringify(course.examCase.keyPoints) + ". " +
        "Antworte AUSSCHLIESSLICH als valides JSON-Objekt: " +
        '{"score": <0-100>, "feedback": "<3-5 Sätze konstruktives Feedback auf Deutsch, was gut war und was fehlt>", ' +
        '"erfuellteKriterien": [<Liste der erfüllten Kriterien, wörtlich aus der Rubrik übernommen>], ' +
        '"fehlendeKriterien": [<Liste der NICHT erfüllten Kriterien, wörtlich aus der Rubrik übernommen — konkret das, was für 100% noch fehlt>]}. ' +
        "Kein Text außerhalb des JSON.",
      [{ role: "user", content: "Frage: " + course.examCase.prompt + "\n\nAntwort: " + capstoneAnswer }],
      600
    );
    let grading;
    try { grading = JSON.parse(raw.replace(/```json|```/g, "").trim()); }
    catch (e) { grading = { score: 50, feedback: raw, erfuellteKriterien: [], fehlendeKriterien: [] }; }

    const mcPct = mcTotal > 0 ? (mcScore / mcTotal) * 100 : 0;
    const passed = mcPct >= 80 && grading.score >= 60;
    const combinedScore = Math.round((mcPct * 0.6) + (grading.score * 0.4));

    const { error: insertError } = await auth.client.from("exam_results").insert({
      user_id: auth.user.id,
      course_id: courseId,
      score: combinedScore,
      total: 100,
      passed,
      mc_score: mcScore,
      mc_total: mcTotal,
      capstone_score: grading.score,
      capstone_feedback: grading,
    });
    if (insertError) console.error("insert exam_results failed:", insertError.message);

    // increment_xp ist nur für den Service-Role-Client aufrufbar (siehe
    // migration_70) — der RLS-gebundene auth.client hat dafür kein Recht mehr.
    try { await getAdminSupabase().rpc("increment_xp", { uid: auth.user.id, amount: passed ? 150 : 30 }); } catch (e) { console.error("increment_xp failed:", e.message); }

    if (passed) {
      const { data: me } = await auth.client.from("profiles").select("full_name, organization_id").eq("id", auth.user.id).maybeSingle();
      await notifyOrgManagers(admin, me?.organization_id, {
        subject: `Prüfung bestanden: ${course.title}`,
        html: `<p><strong>${me?.full_name || "Ein Vertriebler"}</strong> hat die Prüfung „${course.title}" mit ${combinedScore}% bestanden.</p>`,
      });
    }

    return res.status(200).json({ passed, combinedScore, mcPct: Math.round(mcPct), capstoneGrading: grading });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message || "Unbekannter Fehler." });
  }
}

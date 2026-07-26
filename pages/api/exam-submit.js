import { requireUser } from "../../lib/supabaseServer";
import { COURSES } from "../../lib/curriculum";

async function callClaude(system, messages, maxTokens) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: maxTokens, system, messages }),
  });
  if (!res.ok) throw new Error("Anthropic API error " + res.status + ": " + (await res.text()));
  return res.json();
}

// Pass rule: MC score >= 80% AND capstone open-answer score >= 60.
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const auth = await requireUser(req, res);
  if (!auth) return;
  if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: "ANTHROPIC_API_KEY fehlt." });

  try {
    const { courseId, mcScore, mcTotal, capstoneAnswer } = req.body;
    const course = COURSES.find((c) => c.id === courseId);
    if (!course || !course.examCase) return res.status(400).json({ error: "Kurs nicht gefunden." });

    const data = await callClaude(
      "Du bist ein strenger, aber fairer Trainer für Verkaufspsychologie und bewertest die Abschlussfallstudie einer Kursprüfung. " +
        "Bewertungskriterien: " + JSON.stringify(course.examCase.keyPoints) + ". " +
        'Antworte AUSSCHLIESSLICH als valides JSON: {"score": <0-100>, "feedback": "<3-5 Sätze>"}',
      [{ role: "user", content: "Frage: " + course.examCase.prompt + "\n\nAntwort: " + capstoneAnswer }],
      500
    );
    const raw = (data.content || []).filter((c) => c.type === "text").map((c) => c.text).join("");
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

    await auth.client.rpc("increment_xp", { uid: auth.user.id, amount: passed ? 150 : 30 }).catch(() => {});

    return res.status(200).json({ passed, combinedScore, mcPct: Math.round(mcPct), capstoneGrading: grading });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message || "Unbekannter Fehler." });
  }
}

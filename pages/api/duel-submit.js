import { requireUser } from "../../lib/supabaseServer";
import { COURSES, allMcQuestionsOfCourse } from "../../lib/curriculum";

const ALL_QUESTIONS = (() => {
  const out = [];
  COURSES.forEach((c) => allMcQuestionsOfCourse(c).forEach((q) => out.push(q)));
  return out;
})();

// Server rechnet das Duell-Ergebnis selbst aus den Frage-IDs nach, statt dem
// vom Client berechneten Score zu vertrauen — analog zu quiz-grade.js/
// exam-submit.js. Ohne das könnte man sich per Browser-Konsole einen Sieg
// erschwindeln.
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const auth = await requireUser(req, res);
  if (!auth) return;
  const { client, user } = auth;

  const { duelId, selections } = req.body || {};
  if (!duelId || !Array.isArray(selections)) return res.status(400).json({ error: "duelId und selections erforderlich." });

  try {
    const { data: duel, error: duelErr } = await client.from("duels").select("*").eq("id", duelId).maybeSingle();
    if (duelErr) throw duelErr;
    if (!duel) return res.status(404).json({ error: "Duell nicht gefunden — oder kein Zugriff." });
    if (user.id !== duel.challenger_id && user.id !== duel.opponent_id) {
      return res.status(403).json({ error: "Kein Zugriff auf dieses Duell." });
    }

    const isChallenger = user.id === duel.challenger_id;
    const alreadyPlayed = isChallenger ? duel.challenger_score != null : duel.opponent_score != null;
    if (alreadyPlayed) return res.status(400).json({ error: "Dieses Duell hast du bereits gespielt." });

    let score = 0;
    (duel.question_ids || []).forEach((qId, i) => {
      const q = ALL_QUESTIONS[qId];
      if (q && selections[i] === q.correct) score += 1;
    });

    const update = isChallenger
      ? { challenger_score: score, status: duel.opponent_score != null ? "completed" : "challenger_done" }
      : { opponent_score: score, status: duel.challenger_score != null ? "completed" : "challenger_done" };
    const { error: updateErr } = await client.from("duels").update(update).eq("id", duelId);
    if (updateErr) throw updateErr;

    return res.status(200).json({ ok: true, score });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message || "Duell konnte nicht ausgewertet werden." });
  }
}

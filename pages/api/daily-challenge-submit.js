import { requireUser } from "../../lib/supabaseServer";
import { getAdminSupabase } from "../../lib/supabaseAdmin";
import { COURSES, allMcQuestionsOfCourse } from "../../lib/curriculum";

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function pickTodaysQuestion() {
  const all = [];
  COURSES.forEach((c) => allMcQuestionsOfCourse(c).forEach((q) => all.push(q)));
  const dayNum = Math.floor(Date.now() / 86400000);
  return all[dayNum % all.length];
}

// Server rechnet "richtig/falsch" selbst aus der Tagesfrage nach, statt dem
// vom Client übermittelten Wert zu vertrauen — sonst ließen sich Serie und
// XP per Browser-Konsole fälschen.
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const auth = await requireUser(req, res);
  if (!auth) return;
  const { client, user } = auth;

  const { selected } = req.body || {};
  if (typeof selected !== "number") return res.status(400).json({ error: "selected erforderlich." });

  try {
    const { data: existing } = await client.from("daily_challenge_completions")
      .select("id").eq("user_id", user.id).eq("challenge_date", todayStr()).maybeSingle();
    if (existing) return res.status(400).json({ error: "Heutige Challenge ist schon beantwortet." });

    const question = pickTodaysQuestion();
    const correct = selected === question.correct;

    const { data: profile } = await client.from("profiles").select("streak_count, last_challenge_date").eq("id", user.id).maybeSingle();
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    let newStreak = 1;
    if (profile?.last_challenge_date === yesterday) newStreak = (profile.streak_count || 0) + 1;
    else if (profile?.last_challenge_date === todayStr()) newStreak = profile.streak_count || 1;

    const { error: insErr } = await client.from("daily_challenge_completions").insert({ user_id: user.id, challenge_date: todayStr(), correct });
    if (insErr) throw insErr;
    const { error: updErr } = await client.from("profiles").update({ streak_count: newStreak, last_challenge_date: todayStr() }).eq("id", user.id);
    if (updErr) throw updErr;

    if (correct) {
      try { await getAdminSupabase().rpc("increment_xp", { uid: user.id, amount: 15 }); } catch (e) { console.error("increment_xp failed:", e.message); }
    }

    return res.status(200).json({ ok: true, correct, newStreak, correctIndex: question.correct });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message || "Challenge konnte nicht ausgewertet werden." });
  }
}

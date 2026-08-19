import { useEffect, useState } from "react";
import Layout from "../components/Layout";
import Icon from "../components/Icon";
import { supabase } from "../lib/supabaseClient";
import { apiPost } from "../lib/apiClient";
import { COURSES, allMcQuestionsOfCourse } from "../lib/curriculum";
import { effectiveStreak } from "../lib/streak";
import BereichsTabs, { UEBEN } from "../components/BereichsTabs";

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function pickTodaysQuestion() {
  const all = [];
  COURSES.forEach((c) => allMcQuestionsOfCourse(c).forEach((q) => all.push(q)));
  const dayNum = Math.floor(Date.now() / 86400000); // stabil pro Kalendertag, weltweit gleiche Frage
  return all[dayNum % all.length];
}

export default function DailyChallenge() {
  const [streak, setStreak] = useState(0);
  const [alreadyDone, setAlreadyDone] = useState(false);
  const [selected, setSelected] = useState(null);
  const [revealed, setRevealed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const question = pickTodaysQuestion();

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { data: profile } = await supabase.from("profiles").select("streak_count, last_challenge_date").eq("id", session.user.id).maybeSingle();
      setStreak(effectiveStreak(profile?.streak_count, profile?.last_challenge_date));
      const { data: existing } = await supabase.from("daily_challenge_completions")
        .select("*").eq("user_id", session.user.id).eq("challenge_date", todayStr()).maybeSingle();
      if (existing) { setAlreadyDone(true); setSelected(existing.correct ? question.correct : -1); setRevealed(true); }
      setLoading(false);
    }
    load();
  }, []);

  async function submit(idx) {
    if (alreadyDone) return;
    setError("");
    try {
      // Server rechnet richtig/falsch selbst aus der Tagesfrage nach, statt
      // dem Client zu vertrauen — sonst ließen sich Serie/XP fälschen.
      const { newStreak } = await apiPost("/api/daily-challenge-submit", { selected: idx });
      setSelected(idx);
      setRevealed(true);
      setStreak(newStreak);
      setAlreadyDone(true);
    } catch (e) {
      setError(e.message);
    }
  }

  if (loading) return <Layout><p className="text-textMuted text-sm">Lädt...</p></Layout>;

  return (
    <Layout>
      <h1 className="text-2xl font-display font-medium brand-text-gradient mb-1">Tages-Challenge</h1>
      <div className="brand-stripe w-16 mb-4" />
      <BereichsTabs tabs={UEBEN} />
      <p className="text-textMuted text-sm mb-6">Eine Frage pro Tag, für alle im Team gleich. Baue deine Serie auf!</p>

      <div className="card mb-5 flex items-center gap-3">
        <Icon name="flame" size={22} color="var(--org-accent, #CE3A5C)" />
        <div>
          <div className="font-display text-xl font-bold text-textMain">{streak} {streak === 1 ? "Tag" : "Tage"}</div>
          <div className="text-xs text-textMuted">aktuelle Serie</div>
        </div>
      </div>

      {error && <div className="card border border-coral/40 text-coral text-sm mb-4">{error}</div>}

      <div className="card">
        <p className="text-textMain text-[15px] font-medium mb-4">{question.q}</p>
        <div className="flex flex-col gap-2">
          {question.options.map((opt, i) => {
            let style = "border-line text-textMain";
            if (revealed) {
              if (i === question.correct) style = "border-teal bg-teal/10 text-teal";
              else if (i === selected) style = "border-coral bg-coral/10 text-coral";
              else style = "border-line text-textMuted opacity-60";
            }
            return (
              <button key={i} disabled={revealed} onClick={() => submit(i)}
                className={`text-left px-4 py-3 rounded-lg border text-sm transition ${style}`}>
                {opt}
              </button>
            );
          })}
        </div>
        {revealed && (
          <p className="text-xs text-textMuted mt-4">
            {alreadyDone && selected === question.correct ? "Heute schon geschafft — starke Leistung! Morgen geht's weiter." : alreadyDone ? "Heute schon beantwortet. Morgen gibt's die nächste Frage." : ""}
          </p>
        )}
      </div>
    </Layout>
  );
}

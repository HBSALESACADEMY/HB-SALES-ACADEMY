import { useEffect, useState } from "react";
import Layout from "../components/Layout";
import { supabase } from "../lib/supabaseClient";

function todayStr() { return new Date().toISOString().slice(0, 10); }
function addDays(days) { return new Date(Date.now() + days * 86400000).toISOString().slice(0, 10); }

// Vereinfachtes SM-2: rating 0=Nochmal, 1=Schwer, 2=Gut, 3=Leicht
function nextSchedule(prog, rating) {
  let ease = prog?.ease_factor ?? 2.5;
  let interval = prog?.interval_days ?? 1;
  if (rating === 0) { interval = 1; ease = Math.max(1.3, ease - 0.2); }
  else {
    if (rating === 1) ease = Math.max(1.3, ease - 0.15);
    if (rating === 3) ease = ease + 0.15;
    interval = Math.max(1, Math.round(interval * ease));
  }
  return { ease_factor: ease, interval_days: interval, next_review_date: addDays(interval) };
}

export default function Flashcards() {
  const [selfId, setSelfId] = useState(null);
  const [dueCards, setDueCards] = useState([]);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [doneCount, setDoneCount] = useState(0);

  async function load() {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    setSelfId(session.user.id);

    const [{ data: cards }, { data: progress }] = await Promise.all([
      supabase.from("flashcards").select("*"),
      supabase.from("flashcard_progress").select("*").eq("user_id", session.user.id),
    ]);
    const progressByCard = {};
    (progress || []).forEach((p) => { progressByCard[p.card_id] = p; });

    const due = (cards || []).filter((c) => {
      const p = progressByCard[c.id];
      return !p || p.next_review_date <= todayStr();
    }).map((c) => ({ ...c, progress: progressByCard[c.id] }));

    setDueCards(due);
    setIndex(0);
    setRevealed(false);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function rate(rating) {
    const card = dueCards[index];
    const sched = nextSchedule(card.progress, rating);
    await supabase.from("flashcard_progress").upsert({
      user_id: selfId, card_id: card.id, ...sched, last_result: String(rating),
    });
    setDoneCount((n) => n + 1);
    if (index + 1 < dueCards.length) { setIndex(index + 1); setRevealed(false); }
    else { setDueCards([]); }
  }

  if (loading) return <Layout><p className="text-textMuted text-sm">Lädt...</p></Layout>;

  const card = dueCards[index];

  return (
    <Layout>
      <h1 className="text-2xl font-display font-bold brand-text-gradient mb-1">Flashcards</h1>
      <div className="brand-stripe w-16 mb-3" />
      <p className="text-textMuted text-sm mb-6">Kurze Wiederholungen zu Fakten und Prinzipien — kommt automatisch dann wieder, wenn's am meisten hilft.</p>

      {!card ? (
        <div className="card text-center py-10">
          <p className="text-white font-semibold mb-1">{doneCount > 0 ? "Für heute geschafft! 🎉" : "Keine fälligen Karten heute."}</p>
          <p className="text-textMuted text-sm">{doneCount > 0 ? `Du hast ${doneCount} Karte${doneCount === 1 ? "" : "n"} wiederholt.` : "Schau morgen wieder vorbei, oder ein Manager kann neue Karten anlegen."}</p>
        </div>
      ) : (
        <div className="card">
          <div className="text-[10.5px] font-semibold uppercase tracking-wide text-amber mb-3">{card.tag} · Karte {index + 1}/{dueCards.length}</div>
          <p className="text-white text-[16px] font-medium mb-6 min-h-[60px]">{card.front}</p>
          {revealed ? (
            <>
              <div className="border-t border-line pt-4 mb-5">
                <p className="text-textMuted text-sm">{card.back}</p>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <button onClick={() => rate(0)} className="btn-ghost text-xs py-2.5 text-coral border-coral/40">Nochmal</button>
                <button onClick={() => rate(1)} className="btn-ghost text-xs py-2.5">Schwer</button>
                <button onClick={() => rate(2)} className="btn-ghost text-xs py-2.5 text-teal border-teal/40">Gut</button>
                <button onClick={() => rate(3)} className="btn-ghost text-xs py-2.5 text-violet border-violet/40">Leicht</button>
              </div>
            </>
          ) : (
            <button onClick={() => setRevealed(true)} className="btn">Antwort zeigen</button>
          )}
        </div>
      )}
    </Layout>
  );
}

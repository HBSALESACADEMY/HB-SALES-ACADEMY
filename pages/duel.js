import { useEffect, useState } from "react";
import Layout from "../components/Layout";
import Avatar from "../components/Avatar";
import { supabase } from "../lib/supabaseClient";
import { openProfile } from "../lib/profileModalBus";
import { COURSES, allMcQuestionsOfCourse } from "../lib/curriculum";

const ALL_QUESTIONS = (() => {
  const out = [];
  COURSES.forEach((c) => allMcQuestionsOfCourse(c).forEach((q) => out.push(q)));
  return out;
})();

function pickRandomQuestionIds(n = 5) {
  const idx = ALL_QUESTIONS.map((_, i) => i);
  for (let i = idx.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return idx.slice(0, n);
}

export default function Duel() {
  const [selfId, setSelfId] = useState(null);
  const [contacts, setContacts] = useState([]);
  const [profileNames, setProfileNames] = useState({});
  const [duels, setDuels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [playing, setPlaying] = useState(null); // duel being played
  const [qIndex, setQIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [selectedContact, setSelectedContact] = useState("");
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    setSelfId(session.user.id);

    const [{ data: profiles }, { data: myDuels }] = await Promise.all([
      supabase.from("profiles").select("id, full_name").eq("status", "approved").neq("id", session.user.id).order("full_name"),
      supabase.from("duels").select("*").or(`challenger_id.eq.${session.user.id},opponent_id.eq.${session.user.id}`).order("created_at", { ascending: false }),
    ]);
    setContacts(profiles || []);
    const names = {};
    (profiles || []).forEach((p) => { names[p.id] = p.full_name || "Unbenannt"; });
    names[session.user.id] = "Du";
    setProfileNames(names);
    setDuels(myDuels || []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function challenge() {
    if (!selectedContact) return;
    setError("");
    const { data: { session } } = await supabase.auth.getSession();
    const qIds = pickRandomQuestionIds(5);
    const { error: err } = await supabase.from("duels").insert({
      challenger_id: session.user.id, opponent_id: selectedContact, question_ids: qIds,
    });
    if (err) { setError(err.message); return; }
    setSelectedContact("");
    await load();
  }

  function playDuel(duel) {
    setPlaying(duel);
    setQIndex(0);
    setScore(0);
  }

  async function answer(idx) {
    const qId = playing.question_ids[qIndex];
    const question = ALL_QUESTIONS[qId];
    const newScore = score + (idx === question.correct ? 1 : 0);
    if (qIndex + 1 < playing.question_ids.length) {
      setScore(newScore);
      setQIndex(qIndex + 1);
    } else {
      const isChallenger = playing.challenger_id === selfId;
      const update = isChallenger
        ? { challenger_score: newScore, status: playing.opponent_score != null ? "completed" : "challenger_done" }
        : { opponent_score: newScore, status: playing.challenger_score != null ? "completed" : "challenger_done" };
      const { error: err } = await supabase.from("duels").update(update).eq("id", playing.id);
      if (err) setError(err.message);
      setPlaying(null);
      await load();
    }
  }

  if (loading) return <Layout><p className="text-textMuted text-sm">Lädt...</p></Layout>;

  if (playing) {
    const qId = playing.question_ids[qIndex];
    const question = ALL_QUESTIONS[qId];
    return (
      <Layout>
        <h1 className="text-2xl font-display font-semibold brand-text-gradient mb-1">Quiz-Duell</h1>
        <div className="brand-stripe w-16 mb-4" />
        <div className="card">
          <div className="text-xs text-textMuted mb-3">Frage {qIndex + 1}/{playing.question_ids.length}</div>
          <p className="text-textMain text-[15px] font-medium mb-4">{question.q}</p>
          <div className="flex flex-col gap-2">
            {question.options.map((opt, i) => (
              <button key={i} onClick={() => answer(i)} className="text-left px-4 py-3 rounded-lg border border-line text-sm text-textMain hover:border-[var(--org-color-1,#35406E)] hover:bg-surfaceRaised transition">
                {opt}
              </button>
            ))}
          </div>
        </div>
      </Layout>
    );
  }

  const myTurnDuels = duels.filter((d) => {
    const isChallenger = d.challenger_id === selfId;
    return (isChallenger && d.challenger_score == null) || (!isChallenger && d.opponent_score == null);
  });
  const doneDuels = duels.filter((d) => d.status === "completed");

  return (
    <Layout>
      <h1 className="text-2xl font-display font-semibold brand-text-gradient mb-1">Quiz-Duell</h1>
      <div className="brand-stripe w-16 mb-4" />
      <p className="text-textMuted text-sm mb-6">Fordere einen Kollegen zu 5 Fragen heraus — wer besser abschneidet, gewinnt.</p>

      {error && <div className="card border border-coral/40 text-coral text-sm mb-4">{error}</div>}

      <div className="card mb-6">
        <div className="font-semibold text-textMain text-sm mb-3">Neues Duell starten</div>
        <div className="flex items-center gap-2 flex-wrap">
          <select className="input !w-auto" value={selectedContact} onChange={(e) => setSelectedContact(e.target.value)}>
            <option value="">Gegner wählen...</option>
            {contacts.map((c) => <option key={c.id} value={c.id}>{c.full_name || "Unbenannt"}</option>)}
          </select>
          <button disabled={!selectedContact} onClick={challenge} className="btn disabled:opacity-40">Herausfordern</button>
        </div>
      </div>

      {myTurnDuels.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-semibold text-textMain mb-2.5">Du bist dran</h2>
          <div className="flex flex-col gap-2.5">
            {myTurnDuels.map((d) => {
              const opponentId = d.challenger_id === selfId ? d.opponent_id : d.challenger_id;
              return (
                <div key={d.id} className="card flex items-center gap-3">
                  <button onClick={() => openProfile(opponentId)}><Avatar name={profileNames[opponentId] || "?"} size={30} /></button>
                  <div className="flex-1 text-sm text-textMain">vs. {profileNames[opponentId]}</div>
                  <button onClick={() => playDuel(d)} className="btn text-xs">Jetzt spielen</button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <h2 className="text-sm font-semibold text-textMain mb-2.5">Abgeschlossene Duelle</h2>
      <div className="flex flex-col gap-2.5">
        {doneDuels.map((d) => {
          const opponentId = d.challenger_id === selfId ? d.opponent_id : d.challenger_id;
          const myScore = d.challenger_id === selfId ? d.challenger_score : d.opponent_score;
          const theirScore = d.challenger_id === selfId ? d.opponent_score : d.challenger_score;
          const won = myScore > theirScore;
          const tie = myScore === theirScore;
          return (
            <div key={d.id} className="card flex items-center gap-3">
              <button onClick={() => openProfile(opponentId)}><Avatar name={profileNames[opponentId] || "?"} size={30} /></button>
              <div className="flex-1 text-sm">
                <span className="text-textMain">vs. {profileNames[opponentId]}</span>
                <span className="text-textMuted"> — {myScore}:{theirScore}</span>
              </div>
              <span className={`text-xs font-semibold ${won ? "text-teal" : tie ? "text-textMuted" : "text-coral"}`}>
                {won ? "Gewonnen 🎉" : tie ? "Unentschieden" : "Verloren"}
              </span>
            </div>
          );
        })}
        {doneDuels.length === 0 && <p className="text-textMuted text-sm">Noch keine abgeschlossenen Duelle.</p>}
      </div>
    </Layout>
  );
}

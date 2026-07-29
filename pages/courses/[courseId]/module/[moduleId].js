import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import Layout from "../../../../components/Layout";
import Icon from "../../../../components/Icon";
import { COURSES, shuffledOptions } from "../../../../lib/curriculum";
import { apiPost } from "../../../../lib/apiClient";

export default function ModuleRunner() {
  const router = useRouter();
  const { courseId, moduleId } = router.query;
  const course = COURSES.find((c) => c.id === courseId);
  const mod = course && course.modules.find((m) => m.id === moduleId);

  const [phase, setPhase] = useState("theory"); // theory -> mc -> open -> grading -> done
  const [qIndex, setQIndex] = useState(0);
  const [selected, setSelected] = useState(null);
  const [mcScore, setMcScore] = useState(0);
  const [shuffled, setShuffled] = useState(null);
  const [answerText, setAnswerText] = useState("");
  const [grading, setGrading] = useState(null);
  const [error, setError] = useState("");

  const questions = useMemo(() => (mod ? mod.mc : []), [mod]);

  useEffect(() => {
    if (questions.length && phase === "mc" && !shuffled) {
      setShuffled(shuffledOptions(questions[0]));
    }
  }, [phase, questions, shuffled]);

  if (!course || !mod) return <Layout><p className="text-textMuted text-sm">Lädt...</p></Layout>;

  function startQuiz() {
    setPhase("mc");
    setQIndex(0);
    setSelected(null);
    setShuffled(shuffledOptions(questions[0]));
  }

  function chooseOption(i) {
    if (selected !== null) return;
    setSelected(i);
    if (i === shuffled.correctShuffledIndex) setMcScore((s) => s + 1);
  }

  function nextQuestion() {
    if (qIndex + 1 < questions.length) {
      const next = qIndex + 1;
      setQIndex(next);
      setSelected(null);
      setShuffled(shuffledOptions(questions[next]));
    } else {
      setPhase("open");
    }
  }

  async function submitOpenAnswer() {
    if (!answerText.trim()) return;
    setPhase("grading");
    setError("");
    try {
      const { grading } = await apiPost("/api/quiz-grade", {
        courseId: course.id, moduleId: mod.id, answerText, mcScore, mcTotal: questions.length,
      });
      setGrading(grading);
      setPhase("done");
    } catch (e) {
      setError(e.message);
      setPhase("open");
    }
  }

  return (
    <Layout>
      {phase === "theory" && (
        <>
          <h1 className="text-2xl font-display text-textMain mb-1">{mod.title}</h1>
          <p className="text-textMuted text-sm mb-5">{course.title}</p>
          <div className="border-l-[3px] border-amber rounded-r-lg p-4 mb-5 text-[13.5px] text-textMuted leading-relaxed whitespace-pre-line" style={{ background: "rgba(240,178,62,.06)" }}>
            {mod.theory}
          </div>
          <button className="btn" onClick={startQuiz}>Quiz starten ({questions.length} Fragen) <Icon name="chevron" size={14} /></button>
        </>
      )}

      {phase === "mc" && shuffled && (
        <>
          <h1 className="text-2xl font-display text-textMain mb-1">{mod.title}</h1>
          <p className="text-textMuted text-sm mb-4">Frage {qIndex + 1} von {questions.length}</p>
          <div className="flex mb-6">
            {questions.map((_, i) => (
              <div key={i} className="flex items-center">
                <div className={`flex flex-col items-center gap-1.5 text-[11px] w-16 ${i <= qIndex ? "text-amber font-semibold" : "text-textMuted"}`}>
                  <div className={`w-2.5 h-2.5 rounded-full ${i <= qIndex ? "bg-amber shadow-[0_0_10px_rgba(240,178,62,.6)]" : "bg-line"}`} />
                  <span>{i + 1}</span>
                </div>
                {i < questions.length - 1 && <div className={`flex-1 h-0.5 -mb-4 ${i < qIndex ? "bg-amber" : "bg-line"}`} style={{ width: 24 }} />}
              </div>
            ))}
          </div>
          <div className="card max-w-xl">
            <p className="text-[15.5px] font-semibold mb-4">{questions[qIndex].q}</p>
            {shuffled.options.map((opt, i) => {
              let cls = "block w-full text-left px-3.5 py-3 rounded-lg border border-line bg-surfaceRaised mb-2 text-sm cursor-pointer hover:border-amber";
              if (selected !== null) {
                if (i === shuffled.correctShuffledIndex) cls = "block w-full text-left px-3.5 py-3 rounded-lg border border-teal mb-2 text-sm" ;
                else if (i === selected) cls = "block w-full text-left px-3.5 py-3 rounded-lg border border-coral mb-2 text-sm";
              }
              return (
                <button key={i} className={cls} onClick={() => chooseOption(i)} style={selected !== null && i === shuffled.correctShuffledIndex ? { background: "rgba(63,191,166,.12)" } : selected !== null && i === selected ? { background: "rgba(229,113,106,.12)" } : {}}>
                  <span className="flex justify-between items-center">
                    {opt}
                    {selected !== null && i === shuffled.correctShuffledIndex && <Icon name="check" size={16} color="#00E5C7" />}
                    {selected !== null && i === selected && i !== shuffled.correctShuffledIndex && <Icon name="x" size={16} color="#FF4D6D" />}
                  </span>
                </button>
              );
            })}
            {selected !== null && (
              <button className="btn mt-2" onClick={nextQuestion}>
                {qIndex + 1 < questions.length ? "Nächste Frage" : "Weiter zur Fallstudie"} <Icon name="chevron" size={14} />
              </button>
            )}
          </div>
        </>
      )}

      {(phase === "open" || phase === "grading") && (
        <>
          <h1 className="text-2xl font-display text-textMain mb-1">Praxisfall</h1>
          <p className="text-textMuted text-sm mb-4">MC-Teil: {mcScore}/{questions.length} richtig. Jetzt eine offene Fallstudie — deine Antwort wird von der KI bewertet.</p>
          <div className="card max-w-xl">
            <p className="text-[15px] font-medium mb-4 leading-relaxed">{mod.open.prompt}</p>
            <textarea
              className="input" rows={7}
              placeholder="Beschreibe dein konkretes Vorgehen..."
              value={answerText}
              onChange={(e) => setAnswerText(e.target.value)}
              disabled={phase === "grading"}
            />
            {error && <p className="text-coral text-xs mt-2">{error}</p>}
            <button className="btn mt-3" onClick={submitOpenAnswer} disabled={phase === "grading" || !answerText.trim()}>
              {phase === "grading" ? "Wird bewertet..." : "Antwort einreichen"}
            </button>
          </div>
        </>
      )}

      {phase === "done" && grading && (
        <>
          <h1 className="text-2xl font-display text-textMain mb-1">{mod.title} – Ergebnis</h1>
          <div className="card max-w-xl">
            <div className="flex gap-6 mb-4">
              <div>
                <div className="text-[11px] text-textMuted uppercase">Multiple Choice</div>
                <div className="text-2xl font-mono font-bold text-textMain">{Math.round((mcScore / questions.length) * 100)}%</div>
              </div>
              <div>
                <div className="text-[11px] text-textMuted uppercase">Fallstudie (KI-bewertet)</div>
                <div className="text-2xl font-mono font-bold text-textMain">{grading.score}%</div>
              </div>
            </div>
            <div className="border-t border-line pt-4">
              <strong className="text-sm text-textMain block mb-1.5">Feedback zur Fallstudie</strong>
              <p className="text-sm text-textMuted leading-relaxed">{grading.feedback}</p>
              {grading.erfuellteKriterien && grading.erfuellteKriterien.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-3">
                  {grading.erfuellteKriterien.map((k, i) => (
                    <span key={i} className="text-[11.5px] px-2.5 py-1 rounded-full border border-teal text-teal" style={{ background: "rgba(63,191,166,.1)" }}>{k}</span>
                  ))}
                </div>
              )}
            </div>
            <button className="btn mt-5" onClick={() => router.push(`/courses/${course.id}`)}>Zurück zum Kurs</button>
          </div>
        </>
      )}
    </Layout>
  );
}

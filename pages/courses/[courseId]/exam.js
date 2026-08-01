import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import Layout from "../../../components/Layout";
import Icon from "../../../components/Icon";
import { allMcQuestionsOfCourse, shuffledOptions } from "../../../lib/curriculum";
import { useCourse } from "../../../lib/useCourse";
import { apiPost } from "../../../lib/apiClient";
import { triggerConfetti } from "../../../lib/confetti";

function shuffleArray(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function ExamRunner() {
  const router = useRouter();
  const { courseId } = router.query;
  const { course } = useCourse(courseId);

  const [phase, setPhase] = useState("mc"); // mc -> capstone -> grading -> done
  const [questions, setQuestions] = useState(null);
  const [qIndex, setQIndex] = useState(0);
  const [selected, setSelected] = useState(null);
  const [shuffled, setShuffled] = useState(null);
  const [mcScore, setMcScore] = useState(0);
  const [capstoneAnswer, setCapstoneAnswer] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (course && !questions) {
      const qs = shuffleArray(allMcQuestionsOfCourse(course));
      setQuestions(qs);
      setShuffled(shuffledOptions(qs[0]));
    }
  }, [course, questions]);

  if (!course) return <Layout><p className="text-textMuted text-sm">Lädt...</p></Layout>;
  if (!questions || !shuffled) return <Layout><p className="text-textMuted text-sm">Prüfung wird vorbereitet...</p></Layout>;

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
      setPhase("capstone");
    }
  }

  async function submitExam() {
    if (!capstoneAnswer.trim()) return;
    setPhase("grading");
    setError("");
    try {
      const data = await apiPost("/api/exam-submit", {
        courseId: course.id, mcScore, mcTotal: questions.length, capstoneAnswer,
      });
      setResult(data);
      setPhase("done");
      if (data.passed) triggerConfetti();
    } catch (e) {
      setError(e.message);
      setPhase("capstone");
    }
  }

  return (
    <Layout>
      {phase === "mc" && (
        <>
          <h1 className="text-2xl font-display text-textMain mb-1">{course.title} — Kursprüfung</h1>
          <p className="text-textMuted text-sm mb-5">Frage {qIndex + 1} von {questions.length} · Bestehensgrenze: 80% Multiple-Choice + 60% Fallstudie</p>
          <div className="card max-w-xl">
            <p className="text-[15.5px] font-semibold mb-4">{questions[qIndex].q}</p>
            {shuffled.options.map((opt, i) => {
              const isCorrect = i === shuffled.correctShuffledIndex;
              const isSelected = i === selected;
              let style = {};
              if (selected !== null && isCorrect) style = { background: "rgba(63,191,166,.12)", borderColor: "#00E5C7" };
              else if (selected !== null && isSelected) style = { background: "rgba(229,113,106,.12)", borderColor: "#FF4D6D" };
              return (
                <button key={i} className="block w-full text-left px-3.5 py-3 rounded-lg border border-line bg-surfaceRaised mb-2 text-sm" style={style} onClick={() => chooseOption(i)}>
                  <span className="flex justify-between items-center">
                    {opt}
                    {selected !== null && isCorrect && <Icon name="check" size={16} color="#00E5C7" />}
                    {selected !== null && isSelected && !isCorrect && <Icon name="x" size={16} color="#FF4D6D" />}
                  </span>
                </button>
              );
            })}
            {selected !== null && (
              <button className="btn mt-2" onClick={nextQuestion}>
                {qIndex + 1 < questions.length ? "Nächste Frage" : "Weiter zur Abschluss-Fallstudie"} <Icon name="chevron" size={14} />
              </button>
            )}
          </div>
        </>
      )}

      {(phase === "capstone" || phase === "grading") && (
        <>
          <h1 className="text-2xl font-display text-textMain mb-1">Abschluss-Fallstudie</h1>
          <p className="text-textMuted text-sm mb-4">MC-Teil: {mcScore}/{questions.length} richtig ({Math.round((mcScore / questions.length) * 100)}%)</p>
          <div className="card max-w-xl">
            <p className="text-[15px] font-medium mb-4 leading-relaxed">{course.examCase.prompt}</p>
            <textarea className="input" rows={8} placeholder="Beschreibe dein konkretes Vorgehen..." value={capstoneAnswer} onChange={(e) => setCapstoneAnswer(e.target.value)} disabled={phase === "grading"} />
            {error && <p className="text-coral text-xs mt-2">{error}</p>}
            <button className="btn mt-3" onClick={submitExam} disabled={phase === "grading" || !capstoneAnswer.trim()}>
              {phase === "grading" ? "Wird bewertet..." : "Prüfung abschließen"}
            </button>
          </div>
        </>
      )}

      {phase === "done" && result && (
        <>
          <h1 className="text-2xl font-display text-textMain mb-1">Prüfungsergebnis</h1>
          <div className="card max-w-xl">
            <div className="flex items-center gap-2.5 mb-3">
              <Icon name="award" size={22} color={result.passed ? "#00E5C7" : "#FF4D6D"} />
              <span className="font-mono text-2xl font-bold">{result.combinedScore}%</span>
            </div>
            <p className="text-sm text-textMuted mb-3">
              MC-Anteil: {result.mcPct}% · Fallstudie: {result.capstoneGrading.score}%<br />
              {result.passed ? "Prüfung bestanden — nächster Kurs freigeschaltet, PDF-Zertifikat verfügbar!" : "Nicht bestanden (nötig: MC ≥ 80% und Fallstudie ≥ 60%). Module nochmal ansehen und erneut versuchen."}
            </p>
            <div className="border-t border-line pt-3 mb-4">
              <strong className="text-sm text-textMain block mb-1.5">Feedback zur Fallstudie</strong>
              <p className="text-sm text-textMuted leading-relaxed">{result.capstoneGrading.feedback}</p>
            </div>
            <button className="btn" onClick={() => router.push(`/courses/${course.id}`)}>Zurück zum Kurs</button>
          </div>
        </>
      )}
    </Layout>
  );
}

import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Layout, { getCachedOrg } from "../../../components/Layout";
import Icon from "../../../components/Icon";
import { supabase } from "../../../lib/supabaseClient";
import { apiGetBlob } from "../../../lib/apiClient";
import { triggerConfetti } from "../../../lib/confetti";
import { useCourse } from "../../../lib/useCourse";

// Fallback für Zeilen, die vor der fehlendeKriterien-Ergänzung entstanden
// sind: aus der Rubrik einfach das herausrechnen, was die KI als erfüllt
// zurückgegeben hat.
function missingFrom(keyPoints, feedback) {
  if (!feedback) return [];
  if (Array.isArray(feedback.fehlendeKriterien)) return feedback.fehlendeKriterien;
  const erfuellt = new Set(feedback.erfuellteKriterien || []);
  return (keyPoints || []).filter((k) => !erfuellt.has(k));
}

function FeedbackDetail({ feedback, keyPoints }) {
  if (!feedback) return <p className="text-xs text-textMuted mt-2">Für diesen Versuch ist keine Detailauswertung gespeichert (vor dem Update durchgeführt).</p>;
  const fehlend = missingFrom(keyPoints, feedback);
  return (
    <div className="mt-2.5 pt-2.5 border-t border-line">
      {feedback.feedback && <p className="text-xs text-textMuted leading-relaxed mb-2">{feedback.feedback}</p>}
      {feedback.erfuellteKriterien?.length > 0 && (
        <div className="mb-2">
          <div className="text-[10px] uppercase tracking-wide text-teal mb-1">Erfüllt</div>
          <ul className="text-xs text-textMuted list-disc pl-4 space-y-0.5">
            {feedback.erfuellteKriterien.map((k, i) => <li key={i}>{k}</li>)}
          </ul>
        </div>
      )}
      {fehlend.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-wide text-amber mb-1">Für 100% fehlt noch</div>
          <ul className="text-xs text-textMuted list-disc pl-4 space-y-0.5">
            {fehlend.map((k, i) => <li key={i}>{k}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}

export default function CourseDetail() {
  const router = useRouter();
  const { courseId } = router.query;
  const { course } = useCourse(courseId);
  const [quizResults, setQuizResults] = useState([]);
  const [examResults, setExamResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [expandedModuleId, setExpandedModuleId] = useState(null);
  const [examExpanded, setExamExpanded] = useState(false);

  useEffect(() => {
    if (!courseId) return;
    async function load() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const uid = session.user.id;
      const [{ data: qr }, { data: er }] = await Promise.all([
        supabase.from("quiz_results").select("*").eq("user_id", uid).eq("course_id", courseId),
        supabase.from("exam_results").select("*").eq("user_id", uid).eq("course_id", courseId),
      ]);
      setQuizResults(qr || []);
      setExamResults(er || []);
      setLoading(false);
    }
    load();
  }, [courseId]);

  if (!course) return <Layout><p className="text-textMuted text-sm">Lädt...</p></Layout>;

  function moduleUnlocked(idx) {
    if (idx === 0) return true;
    return quizResults.some((r) => r.module_id === course.modules[idx - 1].id);
  }
  const doneCount = course.modules.filter((m) => quizResults.some((r) => r.module_id === m.id)).length;
  const examAvailable = doneCount === course.modules.length;
  const passed = examResults.some((r) => r.passed);
  const lastExam = examResults.slice().sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];

  async function downloadCertificate() {
    setDownloading(true);
    try {
      const blob = await apiGetBlob(`/api/certificate?courseId=${course.id}`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `Zertifikat-${course.id}.pdf`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
      triggerConfetti();
    } catch (e) {
      alert(e.message);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <Layout>
      <button className="btn-ghost btn mb-4" onClick={() => router.push(course.isPersonal ? "/lernpfad" : "/courses")}>← {course.isPersonal ? "Mein Lernpfad" : "Alle Kurse"}</button>
      <h1 className="text-2xl font-display text-textMain mb-1">{course.title}</h1>
      <p className="text-textMuted text-sm mb-6">{course.desc}</p>

      {loading ? (
        <p className="text-textMuted text-sm">Lädt...</p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-4 mb-5">
            {course.modules.map((m, idx) => {
              const unlocked = moduleUnlocked(idx);
              const result = quizResults.find((r) => r.module_id === m.id);
              const isExpanded = expandedModuleId === m.id;
              return (
                <div key={m.id} className={`card ${!unlocked ? "opacity-45" : ""}`}>
                  <div className={unlocked ? "cursor-pointer" : "cursor-not-allowed"} onClick={() => unlocked && router.push(`/courses/${course.id}/module/${m.id}`)}>
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ color: course.accent, background: "rgba(255,255,255,.06)" }}>Modul {idx + 1}</span>
                    <div className="font-display text-[15.5px] font-semibold text-textMain my-1.5">{m.title}</div>
                    <div className="text-xs text-textMuted leading-relaxed">
                      {result ? `MC: ${Math.round((result.mc_score / result.mc_total) * 100)}% · Fallstudie: ${result.open_score}%` : (unlocked ? "Noch nicht bearbeitet" : "Gesperrt")}
                    </div>
                  </div>
                  {result && (
                    <>
                      <button
                        className="btn-ghost text-[11px] mt-2 !py-1"
                        onClick={(e) => { e.stopPropagation(); setExpandedModuleId(isExpanded ? null : m.id); }}
                      >
                        {isExpanded ? "Auswertung ausblenden" : "Auswertung ansehen"}
                      </button>
                      {isExpanded && <FeedbackDetail feedback={result.open_feedback} keyPoints={m.open?.keyPoints} />}
                    </>
                  )}
                </div>
              );
            })}
          </div>

          <div className="card">
            <div className="flex items-center gap-2 mb-2"><Icon name="award" color="var(--org-accent, #CE3A5C)" /><strong className="text-sm">Kursprüfung</strong></div>
            {passed ? (
              <div className="border-2 border-amber rounded-xl p-5 text-center mb-3" style={{ background: "rgba(240,178,62,.06)" }}>
                <div className="text-xs text-textMuted mb-1.5">Zertifikat erhalten</div>
                <img src={getCachedOrg()?.logo_url || "/logo.svg"} alt={getCachedOrg()?.name || "HB Sales Academy"} className="h-6 w-auto mx-auto mb-2" />
                <div className="font-display text-[17px] text-textMain mb-2.5">{course.title}</div>
                <button className="btn" onClick={downloadCertificate} disabled={downloading}>
                  <Icon name="download" size={14} /> {downloading ? "Wird erstellt..." : "PDF-Zertifikat herunterladen"}
                </button>
              </div>
            ) : examAvailable ? (
              <>
                <p className="text-[13.5px] text-textMuted mb-2.5">
                  Alle Module abgeschlossen.{lastExam ? ` Letzter Versuch: ${lastExam.score}% (nötig: MC ≥ 80% und Fallstudie ≥ 60%).` : ""} Bereit für die Kursprüfung.
                </p>
                <button className="btn mb-3" onClick={() => router.push(`/courses/${course.id}/exam`)}>Kursprüfung starten <Icon name="chevron" size={14} /></button>
              </>
            ) : (
              <p className="text-[13.5px] text-textMuted mb-1">Schließe zuerst alle {course.modules.length} Module ab, um die Kursprüfung freizuschalten.</p>
            )}

            {lastExam && (
              <div className={passed ? "" : "border-t border-line pt-3"}>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-textMuted">
                    Letzter Versuch: MC {lastExam.mc_total ? `${Math.round((lastExam.mc_score / lastExam.mc_total) * 100)}%` : "–"} · Fallstudie {lastExam.capstone_score != null ? `${lastExam.capstone_score}%` : "–"} · Gesamt {lastExam.score}%
                  </span>
                  <button className="btn-ghost text-[11px] !py-1 flex-shrink-0" onClick={() => setExamExpanded((v) => !v)}>
                    {examExpanded ? "Ausblenden" : "Details ansehen"}
                  </button>
                </div>
                {examExpanded && <FeedbackDetail feedback={lastExam.capstone_feedback} keyPoints={course.examCase?.keyPoints} />}
              </div>
            )}
          </div>
        </>
      )}
    </Layout>
  );
}

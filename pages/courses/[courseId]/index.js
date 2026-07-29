import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Layout, { getCachedOrg } from "../../../components/Layout";
import Icon from "../../../components/Icon";
import { supabase } from "../../../lib/supabaseClient";
import { apiGetBlob } from "../../../lib/apiClient";
import { triggerConfetti } from "../../../lib/confetti";
import { COURSES } from "../../../lib/curriculum";

export default function CourseDetail() {
  const router = useRouter();
  const { courseId } = router.query;
  const course = COURSES.find((c) => c.id === courseId);
  const [quizResults, setQuizResults] = useState([]);
  const [examResults, setExamResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);

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
      <button className="btn-ghost btn mb-4" onClick={() => router.push("/courses")}>← Alle Kurse</button>
      <h1 className="text-2xl font-display text-white mb-1">{course.title}</h1>
      <p className="text-textMuted text-sm mb-6">{course.desc}</p>

      {loading ? (
        <p className="text-textMuted text-sm">Lädt...</p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-4 mb-5">
            {course.modules.map((m, idx) => {
              const unlocked = moduleUnlocked(idx);
              const result = quizResults.find((r) => r.module_id === m.id);
              return (
                <div
                  key={m.id}
                  className={`card ${unlocked ? "cursor-pointer hover:-translate-y-0.5 hover:shadow-xl transition" : "opacity-45 cursor-not-allowed"}`}
                  onClick={() => unlocked && router.push(`/courses/${course.id}/module/${m.id}`)}
                >
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ color: course.accent, background: "rgba(255,255,255,.06)" }}>Modul {idx + 1}</span>
                  <div className="font-display text-[15.5px] font-semibold text-white my-1.5">{m.title}</div>
                  <div className="text-xs text-textMuted leading-relaxed">
                    {result ? `MC: ${Math.round((result.mc_score / result.mc_total) * 100)}% · Fallstudie: ${result.open_score}%` : (unlocked ? "Noch nicht bearbeitet" : "Gesperrt")}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="card">
            <div className="flex items-center gap-2 mb-2"><Icon name="award" color="var(--org-accent, #E8368F)" /><strong className="text-sm">Kursprüfung</strong></div>
            {passed ? (
              <div className="border-2 border-amber rounded-xl p-5 text-center" style={{ background: "rgba(240,178,62,.06)" }}>
                <div className="text-xs text-textMuted mb-1.5">Zertifikat erhalten</div>
                <img src={getCachedOrg()?.logo_url || "/logo.svg"} alt={getCachedOrg()?.name || "HB Sales Academy"} className="h-6 w-auto mx-auto mb-2" />
                <div className="font-display text-[17px] text-white mb-2.5">{course.title}</div>
                <button className="btn" onClick={downloadCertificate} disabled={downloading}>
                  <Icon name="download" size={14} /> {downloading ? "Wird erstellt..." : "PDF-Zertifikat herunterladen"}
                </button>
              </div>
            ) : examAvailable ? (
              <>
                <p className="text-[13.5px] text-textMuted mb-2.5">
                  Alle Module abgeschlossen.{lastExam ? ` Letzter Versuch: ${lastExam.score}% (nötig: MC ≥ 80% und Fallstudie ≥ 60%).` : ""} Bereit für die Kursprüfung.
                </p>
                <button className="btn" onClick={() => router.push(`/courses/${course.id}/exam`)}>Kursprüfung starten <Icon name="chevron" size={14} /></button>
              </>
            ) : (
              <p className="text-[13.5px] text-textMuted">Schließe zuerst alle {course.modules.length} Module ab, um die Kursprüfung freizuschalten.</p>
            )}
          </div>
        </>
      )}
    </Layout>
  );
}

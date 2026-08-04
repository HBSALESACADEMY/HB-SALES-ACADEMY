import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Layout from "../../components/Layout";
import Icon from "../../components/Icon";
import { supabase } from "../../lib/supabaseClient";
import { COURSES } from "../../lib/curriculum";

export default function CoursesIndex() {
  const router = useRouter();
  const [quizResults, setQuizResults] = useState([]);
  const [examResults, setExamResults] = useState([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const uid = session.user.id;
      const [{ data: qr }, { data: er }, { data: me }] = await Promise.all([
        supabase.from("quiz_results").select("*").eq("user_id", uid),
        supabase.from("exam_results").select("*").eq("user_id", uid),
        supabase.from("profiles").select("is_admin, is_platform_admin").eq("id", uid).maybeSingle(),
      ]);
      setQuizResults(qr || []);
      setExamResults(er || []);
      setIsAdmin(!!me?.is_admin || !!me?.is_platform_admin);
      setLoading(false);
    }
    load();
  }, []);

  // Admins haben direkten Zugriff auf alle Kurse, ohne sie sich sequenziell
  // freispielen zu müssen (siehe Anforderung: direkter Admin-Zugriff).
  function courseUnlocked(idx) {
    if (isAdmin || idx === 0) return true;
    return examResults.some((r) => r.course_id === COURSES[idx - 1].id && r.passed);
  }

  const allPassed = COURSES.every((c) => examResults.some((r) => r.course_id === c.id && r.passed));

  return (
    <Layout>
      <h1 className="text-2xl font-display font-semibold brand-text-gradient mb-1">Kurse</h1>
      <div className="brand-stripe w-16 mb-4" />
      <p className="text-textMuted text-sm mb-6">Sieben Kurse, sequenziell freigeschaltet. Jeder Kurs endet mit einer Prüfung (Multiple-Choice + Fallstudie) und einem PDF-Zertifikat.</p>
      {loading ? (
        <p className="text-textMuted text-sm">Lädt...</p>
      ) : (
        <>
          {allPassed && (
            <div className="card mb-5 border border-teal/40 flex items-center gap-4">
              <div className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "rgba(63,191,166,.15)" }}>
                <Icon name="award" size={20} color="#3FBFA6" />
              </div>
              <div className="flex-1">
                <div className="font-display font-semibold text-textMain">Grundausbildung abgeschlossen! 🎓</div>
                <div className="text-xs text-textMuted">Ab jetzt übernimmt dein persönlicher Lernpfad — maßgeschneidert auf deine Themen.</div>
              </div>
              <button onClick={() => router.push("/lernpfad")} className="btn text-xs flex-shrink-0">Mein Lernpfad</button>
            </div>
          )}
        <div className="flex flex-col gap-3.5">
          {COURSES.map((c, idx) => {
            const unlocked = courseUnlocked(idx);
            const doneCount = c.modules.filter((m) => quizResults.some((r) => r.course_id === c.id && r.module_id === m.id)).length;
            const passed = examResults.some((r) => r.course_id === c.id && r.passed);
            const pct = Math.round((doneCount / c.modules.length) * 100);
            return (
              <div
                key={c.id}
                className={`card flex items-center gap-4 ${unlocked ? "cursor-pointer hover:-translate-y-0.5 hover:shadow-xl transition" : "opacity-50 cursor-not-allowed"}`}
                onClick={() => unlocked && router.push(`/courses/${c.id}`)}
              >
                <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: "rgba(255,255,255,.06)", color: c.accent }}>
                  <Icon name={unlocked ? (passed ? "check" : "book") : "lock"} />
                </div>
                <div className="flex-1">
                  <div className="font-display text-base font-semibold text-textMain">{idx + 1}. {c.title}</div>
                  <div className="text-xs text-textMuted mt-0.5">{c.desc}</div>
                </div>
                <div className="w-28 h-1.5 bg-line rounded-full overflow-hidden flex-shrink-0">
                  <div className="h-full bg-teal" style={{ width: `${pct}%` }} />
                </div>
                <span className="font-mono text-xs text-textMuted w-16 text-right">{doneCount}/{c.modules.length}</span>
              </div>
            );
          })}
        </div>
        </>
      )}
    </Layout>
  );
}

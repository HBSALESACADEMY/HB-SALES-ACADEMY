import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Layout from "../components/Layout";
import Icon from "../components/Icon";
import AIBadge from "../components/AIBadge";
import { supabase } from "../lib/supabaseClient";
import { apiPost } from "../lib/apiClient";
import { COURSES } from "../lib/curriculum";

export default function Lernpfad() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [unlocked, setUnlocked] = useState(false);
  const [courses, setCourses] = useState([]);
  const [quizResults, setQuizResults] = useState([]);
  const [examResults, setExamResults] = useState([]);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const uid = session.user.id;

    const [{ data: me }, { data: er }, { data: pc }, { data: qr }] = await Promise.all([
      supabase.from("profiles").select("is_admin, is_platform_admin").eq("id", uid).maybeSingle(),
      supabase.from("exam_results").select("course_id, passed").eq("user_id", uid),
      supabase.from("personal_courses").select("*").eq("user_id", uid).order("created_at", { ascending: false }),
      supabase.from("quiz_results").select("*").eq("user_id", uid),
    ]);

    const isAdmin = !!me?.is_admin || !!me?.is_platform_admin;
    const allPassed = COURSES.every((c) => (er || []).some((r) => r.course_id === c.id && r.passed));
    setUnlocked(isAdmin || allPassed);
    setCourses(pc || []);
    setQuizResults(qr || []);
    setExamResults(er || []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function generate() {
    setGenerating(true);
    setError("");
    try {
      const { course } = await apiPost("/api/personal-course-generate", {});
      await load();
      router.push(`/courses/${course.id}`);
    } catch (e) {
      setError(e.message || "Fehler bei der Generierung.");
    }
    setGenerating(false);
  }

  if (loading) return <Layout><p className="text-textMuted text-sm">Lädt...</p></Layout>;

  if (!unlocked) {
    return (
      <Layout>
        <h1 className="text-2xl font-display font-semibold brand-text-gradient mb-1">Mein Lernpfad</h1>
        <div className="brand-stripe w-16 mb-4" />
        <div className="card text-center py-10">
          <p className="text-textMain font-semibold mb-1">Noch nicht freigeschaltet.</p>
          <p className="text-textMuted text-sm">Schließe zuerst alle 7 Grundkurse ab — danach schaltet sich dein persönlicher, auf dich zugeschnittener Lernpfad frei.</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <h1 className="text-2xl font-display font-semibold brand-text-gradient mb-1 flex items-center gap-2">
        Mein Lernpfad
        <AIBadge title="Diese Kurse werden automatisch von einer KI erstellt." />
      </h1>
      <div className="brand-stripe w-16 mb-4" />
      <p className="text-textMuted text-sm mb-6">Vollständige, individuell auf dich zugeschnittene Kurse — erkannt aus deinen bisherigen Ergebnissen. Es gibt hier immer wieder einen neuen.</p>

      {error && <div className="card border border-coral/40 text-coral text-sm mb-4">{error}</div>}

      <button disabled={generating} onClick={generate} className="btn mb-6 disabled:opacity-40">
        {generating ? "Wird erstellt... (kann bis zu einer Minute dauern)" : "Neuen Kurs generieren"}
      </button>

      {courses.length === 0 ? (
        <p className="text-textMuted text-sm">Noch kein persönlicher Kurs erstellt — klicke oben, um deinen ersten zu generieren.</p>
      ) : (
        <div className="flex flex-col gap-3.5">
          {courses.map((c) => {
            const passed = examResults.some((r) => r.course_id === c.id && r.passed);
            const doneCount = c.modules.filter((m) => quizResults.some((r) => r.course_id === c.id && r.module_id === m.id)).length;
            const pct = Math.round((doneCount / c.modules.length) * 100);
            return (
              <div
                key={c.id}
                className="card flex items-center gap-4 cursor-pointer hover:-translate-y-0.5 hover:shadow-xl transition"
                onClick={() => router.push(`/courses/${c.id}`)}
              >
                <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: "rgba(255,255,255,.06)", color: c.accent }}>
                  <Icon name={passed ? "check" : "book"} />
                </div>
                <div className="flex-1">
                  <div className="text-[10.5px] text-amber uppercase tracking-wide mb-0.5">{c.focus_area}</div>
                  <div className="font-display text-base font-semibold text-textMain">{c.title}</div>
                  <div className="text-xs text-textMuted mt-0.5">{c.description}</div>
                </div>
                <div className="w-28 h-1.5 bg-line rounded-full overflow-hidden flex-shrink-0">
                  <div className="h-full bg-teal" style={{ width: `${pct}%` }} />
                </div>
                <span className="font-mono text-xs text-textMuted w-16 text-right">{doneCount}/{c.modules.length}</span>
              </div>
            );
          })}
        </div>
      )}
    </Layout>
  );
}

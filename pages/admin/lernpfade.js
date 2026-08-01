import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Layout from "../../components/Layout";
import { supabase } from "../../lib/supabaseClient";
import { apiPost } from "../../lib/apiClient";
import { COURSES } from "../../lib/curriculum";

function weakestModule(quizResults) {
  if (!quizResults.length) return null;
  const scored = quizResults.map((r) => {
    const total = (r.mc_total || 0) + (r.open_total || 0);
    const score = (r.mc_score || 0) + (r.open_score || 0);
    return { course_id: r.course_id, module_id: r.module_id, ratio: total ? score / total : 1 };
  });
  scored.sort((a, b) => a.ratio - b.ratio);
  return scored[0];
}

function moduleTitle(courseId, moduleId) {
  const course = COURSES.find((c) => c.id === courseId);
  return course?.modules.find((m) => m.id === moduleId)?.title || moduleId;
}

export default function LernpfadeAdmin() {
  const router = useRouter();
  const [allowed, setAllowed] = useState(true);
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [generatingFor, setGeneratingFor] = useState(null);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const { data: me } = await supabase.from("profiles").select("role, is_admin, is_platform_admin").eq("id", session.user.id).maybeSingle();
    if (!me || (me.role !== "manager" && !me.is_admin && !me.is_platform_admin)) {
      setAllowed(false);
      setLoading(false);
      return;
    }

    const [{ data: profiles }, { data: quiz }, { data: exams }, { data: personalCourses }] = await Promise.all([
      supabase.from("profiles").select("id, full_name, avatar_url").eq("status", "approved"),
      supabase.from("quiz_results").select("*"),
      supabase.from("exam_results").select("user_id, course_id, passed"),
      supabase.from("personal_courses").select("*"),
    ]);

    const quizByUser = {};
    (quiz || []).forEach((r) => { quizByUser[r.user_id] = quizByUser[r.user_id] || []; quizByUser[r.user_id].push(r); });
    const coursesByUser = {};
    (personalCourses || []).forEach((c) => { coursesByUser[c.user_id] = coursesByUser[c.user_id] || []; coursesByUser[c.user_id].push(c); });

    const built = (profiles || []).map((p) => {
      const results = quizByUser[p.id] || [];
      const weak = weakestModule(results);
      const allPassed = COURSES.every((c) => (exams || []).some((r) => r.user_id === p.id && r.course_id === c.id && r.passed));
      return {
        profile: p,
        weak,
        weakTitle: weak ? moduleTitle(weak.course_id, weak.module_id) : null,
        graduated: allPassed,
        personalCourses: coursesByUser[p.id] || [],
      };
    }).sort((a, b) => (a.profile.full_name || "").localeCompare(b.profile.full_name || ""));

    setRows(built);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function generateFor(userId) {
    setGeneratingFor(userId);
    setError("");
    try {
      await apiPost("/api/personal-course-generate", { targetUserId: userId });
      await load();
    } catch (e) {
      setError(e.message || "Fehler bei der Generierung.");
    }
    setGeneratingFor(null);
  }

  if (loading) return <Layout><p className="text-textMuted text-sm">Lädt...</p></Layout>;

  if (!allowed) {
    return (
      <Layout>
        <h1 className="text-2xl font-display text-textMain mb-1">Lernpfade (Team)</h1>
        <p className="text-textMuted text-sm">Diese Ansicht ist nur für Manager/Admins verfügbar.</p>
      </Layout>
    );
  }

  return (
    <Layout>
      <h1 className="text-2xl font-display font-bold brand-text-gradient mb-1">Lernpfade (Team)</h1>
      <div className="brand-stripe w-16 mb-4" />
      <p className="text-textMuted text-sm mb-6">Erkannte Schwächen und bereits generierte persönliche Kurse pro Mitarbeiter:in.</p>

      {error && <div className="card border border-coral/40 text-coral text-sm mb-4">{error}</div>}

      <div className="flex flex-col gap-3">
        {rows.map(({ profile, weak, weakTitle, graduated, personalCourses }) => (
          <div key={profile.id} className="card">
            <div className="flex items-center gap-4">
              <div className="flex-1 min-w-0">
                <div className="font-display font-semibold text-textMain">{profile.full_name || "Unbenannt"}</div>
                <div className="text-xs text-textMuted mt-0.5">
                  {graduated ? "Grundausbildung abgeschlossen" : "Grundausbildung läuft"}
                  {weak && ` · Schwächstes Thema: ${weakTitle} (${Math.round(weak.ratio * 100)}%)`}
                  {!weak && " · Noch keine Ergebnisse"}
                </div>
                <div className="text-[10.5px] text-textMuted mt-0.5">{personalCourses.length} persönliche Kurse generiert</div>
              </div>
              <button disabled={generatingFor === profile.id} onClick={() => generateFor(profile.id)} className="btn-ghost text-xs flex-shrink-0 disabled:opacity-40">
                {generatingFor === profile.id ? "Wird erstellt..." : "Kurs generieren"}
              </button>
            </div>
            {personalCourses.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-line">
                {personalCourses.map((c) => (
                  <button key={c.id} onClick={() => router.push(`/courses/${c.id}`)} className="text-[11.5px] px-2.5 py-1 rounded-full border border-line text-textMuted hover:text-textMain hover:border-[var(--org-color-1,#4A3565)]">
                    {c.title}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
        {rows.length === 0 && <p className="text-textMuted text-sm">Keine Mitarbeiter:innen gefunden.</p>}
      </div>
    </Layout>
  );
}

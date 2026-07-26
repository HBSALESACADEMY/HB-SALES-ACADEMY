import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Layout from "../components/Layout";
import Icon from "../components/Icon";
import { supabase } from "../lib/supabaseClient";
import { COURSES } from "../lib/curriculum";

export default function Dashboard() {
  const router = useRouter();
  const [quizResults, setQuizResults] = useState([]);
  const [examResults, setExamResults] = useState([]);
  const [rpSessions, setRpSessions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const uid = session.user.id;
      const [{ data: qr }, { data: er }, { data: rp }] = await Promise.all([
        supabase.from("quiz_results").select("*").eq("user_id", uid),
        supabase.from("exam_results").select("*").eq("user_id", uid),
        supabase.from("roleplay_sessions").select("*").eq("user_id", uid),
      ]);
      setQuizResults(qr || []);
      setExamResults(er || []);
      setRpSessions(rp || []);
      setLoading(false);
    }
    load();
  }, []);

  const totalModules = COURSES.reduce((s, c) => s + c.modules.length, 0);
  const doneModuleIds = new Set(quizResults.map((r) => r.module_id));
  const certCount = examResults.filter((r) => r.passed).length;
  const avgMc = quizResults.length ? Math.round(quizResults.reduce((s, r) => s + (r.mc_total ? r.mc_score / r.mc_total : 0), 0) / quizResults.length * 100) : null;
  const nextCourse = COURSES.find((c) => !examResults.some((r) => r.course_id === c.id && r.passed));

  return (
    <Layout>
      {(profile) => (
        <>
          <h1 className="text-2xl font-display text-white mb-1">Willkommen zurück{profile?.full_name ? `, ${profile.full_name}` : ""}</h1>
          <p className="text-textMuted text-sm mb-6">Dein Überblick über Fortschritt und nächste Schritte.</p>

          {loading ? (
            <p className="text-textMuted text-sm">Lädt...</p>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5 mb-5">
                <div className="card"><div className="text-[11px] text-textMuted uppercase mb-1.5">Module abgeschlossen</div><div className="text-2xl font-display font-bold text-white font-mono">{doneModuleIds.size}/{totalModules}</div></div>
                <div className="card"><div className="text-[11px] text-textMuted uppercase mb-1.5">Ø MC-Ergebnis</div><div className="text-2xl font-display font-bold text-white font-mono">{avgMc !== null ? avgMc + "%" : "–"}</div></div>
                <div className="card"><div className="text-[11px] text-textMuted uppercase mb-1.5">Zertifikate</div><div className="text-2xl font-display font-bold text-white font-mono">{certCount}/{COURSES.length}</div></div>
                <div className="card"><div className="text-[11px] text-textMuted uppercase mb-1.5">Rollenspiele</div><div className="text-2xl font-display font-bold text-white font-mono">{rpSessions.length}</div></div>
              </div>

              <div className="card mb-5">
                <div className="flex items-center gap-2 mb-3"><Icon name="award" color="#F0B23E" /><strong className="text-sm">Kurs-Übersicht</strong></div>
                <div className="flex flex-col gap-2">
                  {COURSES.map((c) => {
                    const doneCount = c.modules.filter((m) => doneModuleIds.has(m.id)).length;
                    const passed = examResults.some((r) => r.course_id === c.id && r.passed);
                    return (
                      <div key={c.id} className="flex items-center gap-3 text-sm">
                        <span style={{ color: c.accent }}>{passed ? <Icon name="check" size={14} /> : <Icon name="book" size={14} />}</span>
                        <span className="flex-1 text-white">{c.title}</span>
                        <span className="text-textMuted font-mono text-xs">{doneCount}/{c.modules.length} Module</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="card">
                <div className="flex items-center gap-2 mb-3"><Icon name="target" color="#F0B23E" /><strong className="text-sm">Nächster Schritt</strong></div>
                {nextCourse ? (
                  <>
                    <p className="text-sm text-textMuted mb-3">Weiter mit: <strong className="text-white">{nextCourse.title}</strong> – {nextCourse.desc}</p>
                    <button className="btn" onClick={() => router.push("/courses")}>Kurse öffnen <Icon name="chevron" size={14} /></button>
                  </>
                ) : (
                  <>
                    <p className="text-sm text-textMuted mb-3">Alle Kurse abgeschlossen — nutze das Rollenspiel weiter zur Vertiefung.</p>
                    <button className="btn" onClick={() => router.push("/roleplay")}>Zum Rollenspiel <Icon name="chevron" size={14} /></button>
                  </>
                )}
              </div>
            </>
          )}
        </>
      )}
    </Layout>
  );
}

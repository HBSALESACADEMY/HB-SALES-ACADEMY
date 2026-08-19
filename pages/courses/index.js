import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Layout from "../../components/Layout";
import Icon from "../../components/Icon";
import { supabase } from "../../lib/supabaseClient";
import { COURSES } from "../../lib/curriculum";
import AIBadge from "../../components/AIBadge";
import { apiPost } from "../../lib/apiClient";

// Kurse lagen früher auf drei Reitern verteilt: die Grundausbildung hier,
// die KI-Kurse unter "Mein Lernpfad", die Kurse der Organisation unter
// "Eigene Inhalte". Wer "Kurse" öffnete, sah also gerade NICHT alle seine
// Kurse. Jetzt alles auf einer Seite, in drei Abschnitten.
const EIGENE_FARBEN = { amber: "var(--org-accent, #CE3A5C)", teal: "#00E5C7", coral: "#FF4D6D", violet: "var(--org-color-1, #4C5DC9)" };

export default function CoursesIndex() {
  const router = useRouter();
  const [quizResults, setQuizResults] = useState([]);
  const [examResults, setExamResults] = useState([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [eigene, setEigene] = useState([]);
  const [modulZahl, setModulZahl] = useState({});
  const [persoenliche, setPersoenliche] = useState([]);
  const [erzeugt, setErzeugt] = useState(false);
  const [fehler, setFehler] = useState("");

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const uid = session.user.id;
      const [{ data: qr }, { data: er }, { data: me }, { data: cs }, { data: ms }, { data: pc }] = await Promise.all([
        supabase.from("quiz_results").select("*").eq("user_id", uid),
        supabase.from("exam_results").select("*").eq("user_id", uid),
        supabase.from("profiles").select("is_admin, is_platform_admin").eq("id", uid).maybeSingle(),
        supabase.from("custom_courses").select("*").order("order_index"),
        supabase.from("custom_modules").select("course_id"),
        supabase.from("personal_courses").select("*").eq("user_id", uid).order("created_at", { ascending: false }),
      ]);
      setQuizResults(qr || []);
      setExamResults(er || []);
      setIsAdmin(!!me?.is_admin || !!me?.is_platform_admin);
      setEigene(cs || []);
      const zahl = {};
      (ms || []).forEach((m) => { zahl[m.course_id] = (zahl[m.course_id] || 0) + 1; });
      setModulZahl(zahl);
      setPersoenliche(pc || []);
      setLoading(false);
    }
    load();
  }, []);

  async function erzeugeKurs() {
    setErzeugt(true);
    setFehler("");
    try {
      const { course } = await apiPost("/api/personal-course-generate", {});
      router.push(`/courses/${course.id}`);
    } catch (e) {
      setFehler(e.message || "Der Kurs konnte nicht erstellt werden.");
    }
    setErzeugt(false);
  }

  // Admins haben direkten Zugriff auf alle Kurse, ohne sie sich sequenziell
  // freispielen zu müssen (siehe Anforderung: direkter Admin-Zugriff).
  function courseUnlocked(idx) {
    if (isAdmin || idx === 0) return true;
    return examResults.some((r) => r.course_id === COURSES[idx - 1].id && r.passed);
  }

  const allPassed = COURSES.every((c) => examResults.some((r) => r.course_id === c.id && r.passed));

  return (
    <Layout>
      <h1 className="text-2xl font-display font-medium brand-text-gradient mb-1">Kurse</h1>
      <div className="brand-stripe w-16 mb-4" />
      <p className="text-textMuted text-sm mb-6">Deine gesamte Ausbildung an einem Ort: die Grundausbildung, dein persönlicher Lernpfad und die Kurse deiner Organisation.</p>
      {loading ? (
        <p className="text-textMuted text-sm">Lädt...</p>
      ) : (
        <>
          <div className="text-[11px] uppercase tracking-wide text-textMuted mb-2">Grundausbildung</div>
          {allPassed && (
            <div className="card mb-5 border border-teal/40 flex items-center gap-4">
              <div className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "rgba(63,191,166,.15)" }}>
                <Icon name="award" size={20} color="#3FBFA6" />
              </div>
              <div className="flex-1">
                <div className="font-display font-semibold text-textMain">Grundausbildung abgeschlossen! 🎓</div>
                <div className="text-xs text-textMuted">Ab jetzt übernimmt dein persönlicher Lernpfad — direkt darunter.</div>
              </div>
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

        {/* Steht direkt unter der Grundausbildung, nicht am Seitenende: die
            automatisch erzeugten Kurse sind deren Fortsetzung und sollen wie
            eine gehören, nicht wie ein Anhang wirken. Die Kurse der
            Organisation stehen deshalb darunter. */}
        <div className="text-[11px] uppercase tracking-wide text-textMuted mt-6 mb-2 flex items-center gap-2">
          Dein persönlicher Lernpfad <AIBadge title="Diese Kurse werden automatisch von einer KI erstellt." />
        </div>
        {!(allPassed || isAdmin) ? (
          <p className="text-textMuted text-sm">
            Schließe zuerst die Grundausbildung ab — danach erstellt die Academy dir laufend neue Kurse,
            zugeschnitten auf deine bisherigen Ergebnisse.
          </p>
        ) : (
          <>
            {fehler && <div className="card border border-coral/40 text-coral text-sm mb-3">{fehler}</div>}
            <button disabled={erzeugt} onClick={erzeugeKurs} className="btn text-xs mb-4 disabled:opacity-40">
              {erzeugt ? "Wird erstellt... (kann bis zu einer Minute dauern)" : "Neuen Kurs generieren"}
            </button>
            {persoenliche.length === 0 ? (
              <p className="text-textMuted text-sm">Noch kein persönlicher Kurs erstellt.</p>
            ) : (
              <div className="flex flex-col gap-3.5">
                {persoenliche.map((c) => {
                  const bestanden = examResults.some((r) => r.course_id === c.id && r.passed);
                  const fertig = c.modules.filter((m) => quizResults.some((r) => r.course_id === c.id && r.module_id === m.id)).length;
                  return (
                    <div key={c.id} className="card flex items-center gap-4 cursor-pointer hover:-translate-y-0.5 hover:shadow-xl transition"
                      onClick={() => router.push(`/courses/${c.id}`)}>
                      <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: "rgba(255,255,255,.06)", color: c.accent }}>
                        <Icon name={bestanden ? "check" : "book"} />
                      </div>
                      <div className="flex-1">
                        <div className="text-[10.5px] text-amber uppercase tracking-wide mb-0.5">{c.focus_area}</div>
                        <div className="font-display text-base font-semibold text-textMain">{c.title}</div>
                        <div className="text-xs text-textMuted mt-0.5">{c.description}</div>
                      </div>
                      <div className="w-28 h-1.5 bg-line rounded-full overflow-hidden flex-shrink-0">
                        <div className="h-full bg-teal" style={{ width: `${Math.round((fertig / c.modules.length) * 100)}%` }} />
                      </div>
                      <span className="font-mono text-xs text-textMuted w-16 text-right">{fertig}/{c.modules.length}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {eigene.length > 0 && (
          <>
            <div className="text-[11px] uppercase tracking-wide text-textMuted mt-8 mb-2">Kurse deiner Organisation</div>
            <div className="flex flex-col gap-3.5">
              {eigene.map((c) => (
                <div key={c.id} className="card flex items-center gap-4 cursor-pointer hover:-translate-y-0.5 hover:shadow-xl transition"
                  onClick={() => router.push(`/custom-courses/${c.id}`)}>
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: "rgba(255,255,255,.06)", color: EIGENE_FARBEN[c.color] }}>
                    <Icon name="book" />
                  </div>
                  <div className="flex-1">
                    <div className="font-display text-base font-semibold text-textMain">{c.title}</div>
                    <div className="text-xs text-textMuted mt-0.5">{c.description}</div>
                  </div>
                  <span className="font-mono text-xs text-textMuted flex-shrink-0">{modulZahl[c.id] || 0} Module</span>
                </div>
              ))}
            </div>
          </>
        )}
        </>
      )}
    </Layout>
  );
}

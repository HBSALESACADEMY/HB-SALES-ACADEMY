import { randomUUID } from "crypto";
import { callAI } from "./aiClient.js";
import { COURSES } from "./curriculum.js";

function findModule(courseId, moduleId) {
  const course = COURSES.find((c) => c.id === courseId);
  const mod = course?.modules.find((m) => m.id === moduleId);
  return course && mod ? { course, mod } : null;
}

// Wählt das Modul mit der schwächsten Quote (mc+open Score/Total). Bei
// durchgehend guten Ergebnissen gibt es keine echte Schwäche — dann dient
// dasselbe Modul als Vertiefungs-Ausgangspunkt statt als Aufholbedarf.
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

function validateGenerated(content) {
  if (!content?.title || !content?.description || !Array.isArray(content.modules) || content.modules.length < 1) return false;
  if (!content.examCase?.prompt || !Array.isArray(content.examCase?.keyPoints)) return false;
  return content.modules.every((m) =>
    m.title && m.theory && Array.isArray(m.mc) && m.mc.length >= 4 &&
    m.mc.every((q) => q.q && Array.isArray(q.options) && q.options.length === 4 && Number.isInteger(q.correct)) &&
    m.open?.prompt && Array.isArray(m.open?.keyPoints)
  );
}

// Generiert für einen Nutzer einen individuellen Zusatzkurs anhand seiner
// Quiz-Ergebnisse (manuell über /api/personal-course-generate ODER automatisch
// nach einer bestandenen Prüfung, siehe exam-submit.js) und schlägt die
// Kernerkenntnis zusätzlich für die geteilte Wissensdatenbank vor (Manager
// muss sie unter "Vorschläge" noch freigeben) — so wächst sowohl der
// persönliche Lernpfad als auch das gemeinsame Wissen mit jedem Abschluss.
export async function generatePersonalCourseFor(admin, targetUserId, createdBy) {
  const { data: quizResults } = await admin.from("quiz_results").select("*").eq("user_id", targetUserId);
  const weakest = weakestModule(quizResults || []);
  const found = weakest ? findModule(weakest.course_id, weakest.module_id) : null;
  const fallback = { course: COURSES[0], mod: COURSES[0].modules[0] };
  const { course, mod } = found || fallback;
  const isWeak = weakest !== null && weakest.ratio < 0.75;

  const raw = await callAI(
    "Du erstellst einen vollständigen, individuellen Zusatzkurs für einen Vertriebler auf einer Vertriebstrainings-Plattform, " +
      "im gleichen Format wie die bestehenden Grundkurse: mehrere Module mit Theorie, Multiple-Choice-Quiz und offener " +
      "Praxisfrage, plus eine Abschluss-Fallstudie. Ausgangspunkt ist ein Thema, bei dem die Person " +
      (isWeak
        ? "nachweislich Schwierigkeiten hatte — der Kurs soll das noch einmal klar und ermutigend erklären (kein " +
          "belehrender Ton), mit Fokus auf typische Verwechslungen/Missverständnisse."
        : "die Grundlagen bereits gut beherrscht — der Kurs soll als VERTIEFUNG dienen, mit fortgeschritteneren, " +
          "kniffligeren Situationen statt reiner Wiederholung.") +
      " Erstelle GENAU 3 Module. Jedes Modul: ein Titel, eine Theorie (2 kurze Absätze, getrennt durch \\n\\n, im Ton " +
      "eines Vertriebstrainers), GENAU 6 Multiple-Choice-Fragen (je 4 Antwortoptionen, genau ein Index 0-3 korrekt), " +
      "und eine offene Praxisfrage mit einer Bewertungs-Rubrik aus 4 Punkten. Am Ende eine Abschluss-Fallstudie " +
      "(eine realistische Gesprächssituation als Frage) mit ebenfalls 4 Bewertungspunkten. Alles auf Deutsch, " +
      "konkret auf den Vertriebsalltag bezogen, keine generischen Plattitüden. " +
      "Antworte AUSSCHLIESSLICH als valides JSON in genau dieser Form: " +
      '{"title": "<Kurstitel>", "description": "<1 Satz Kursbeschreibung>", "modules": [' +
      '{"title": "<Modultitel>", "theory": "<2 Absätze>", ' +
      '"mc": [{"q": "<Frage>", "options": ["A","B","C","D"], "correct": 0}], ' +
      '"open": {"prompt": "<offene Praxisfrage>", "keyPoints": ["p1","p2","p3","p4"]}}' +
      '], "examCase": {"prompt": "<Fallstudie>", "keyPoints": ["p1","p2","p3","p4"]}}. ' +
      "Kein Text außerhalb des JSON.",
    [{ role: "user", content: `Ausgangs-Thema — Kurs: ${course.title}\nModul: ${mod.title}\n\n${mod.theory}` }],
    3500
  );

  let content;
  try {
    content = JSON.parse(raw.replace(/```json|```/g, "").trim());
  } catch (e) {
    throw new Error("Die KI-Antwort konnte nicht gelesen werden.");
  }
  if (!validateGenerated(content)) {
    throw new Error("Unvollständige KI-Antwort.");
  }

  const courseId = randomUUID();
  const modules = content.modules.map((m, i) => ({
    id: `${courseId}-m${i + 1}`,
    title: m.title,
    theory: m.theory,
    mc: m.mc,
    open: { id: `${courseId}-m${i + 1}-open`, prompt: m.open.prompt, keyPoints: m.open.keyPoints },
  }));
  const examCase = { id: `${courseId}-exam`, prompt: content.examCase.prompt, keyPoints: content.examCase.keyPoints };

  const { data, error } = await admin.from("personal_courses").insert({
    id: courseId,
    user_id: targetUserId,
    title: content.title,
    description: content.description,
    accent: course.accent || "#7B2FF7",
    focus_area: mod.title,
    modules,
    exam_case: examCase,
    created_by: createdBy,
  }).select().single();
  if (error) throw new Error(error.message);

  const { error: kbError } = await admin.from("kb_entries").insert({
    tag: mod.title,
    title: content.title,
    body: content.description,
    status: "pending",
    source: "ai_course",
    created_by: createdBy,
  });
  if (kbError) console.error("insert kb_entries (ai_course) failed:", kbError.message);

  return data;
}

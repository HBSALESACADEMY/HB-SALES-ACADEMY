import { randomUUID } from "crypto";
import { requireUser } from "../../lib/supabaseServer";
import { getAdminSupabase } from "../../lib/supabaseAdmin";
import { callAI } from "../../lib/aiClient";
import { COURSES } from "../../lib/curriculum";

// Ein vollständiger Kurs (3 Module × Theorie+6 MC+offene Frage, plus
// Abschlussprüfung) ist deutlich mehr Text als die bisherigen Generatoren —
// entsprechend mehr Zeit für Gemini einplanen.
export const config = { maxDuration: 60 };

function findModule(courseId, moduleId) {
  const course = COURSES.find((c) => c.id === courseId);
  const mod = course?.modules.find((m) => m.id === moduleId);
  return course && mod ? { course, mod } : null;
}

// Wählt das Modul mit der schwächsten Quote (mc+open Score/Total). Bei
// durchgehend guten Ergebnissen (z.B. ein frisch "abgeschlossener" Admin-
// Account) gibt es keine echte Schwäche — dann dient dasselbe Modul als
// Vertiefungs-Ausgangspunkt statt als Aufholbedarf (siehe Prompt unten).
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

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const auth = await requireUser(req, res);
  if (!auth) return;
  const { client, user } = auth;
  if (!process.env.GEMINI_API_KEY) return res.status(500).json({ error: "GEMINI_API_KEY fehlt." });

  const { targetUserId } = req.body || {};
  const forSelf = !targetUserId || targetUserId === user.id;

  const { data: me } = await client.from("profiles").select("role, is_admin, is_platform_admin, organization_id").eq("id", user.id).maybeSingle();
  if (!me) return res.status(403).json({ error: "Profil nicht gefunden." });

  const admin = getAdminSupabase();
  let target = user.id;

  if (!forSelf) {
    const canManageOthers = me.role === "manager" || me.is_admin || me.is_platform_admin;
    if (!canManageOthers) return res.status(403).json({ error: "Nur Manager/Admins können Kurse für andere generieren." });
    const { data: targetProfile } = await admin.from("profiles").select("organization_id").eq("id", targetUserId).maybeSingle();
    if (!targetProfile) return res.status(404).json({ error: "Nutzer nicht gefunden." });
    if (!me.is_platform_admin && targetProfile.organization_id !== me.organization_id) {
      return res.status(403).json({ error: "Nutzer gehört nicht zu deiner Organisation." });
    }
    target = targetUserId;
  }

  try {
    const { data: quizResults } = await admin.from("quiz_results").select("*").eq("user_id", target);
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
      return res.status(500).json({ error: "Die KI-Antwort konnte nicht gelesen werden. Bitte erneut versuchen." });
    }
    if (!validateGenerated(content)) {
      return res.status(500).json({ error: "Unvollständige KI-Antwort. Bitte erneut versuchen." });
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
      user_id: target,
      title: content.title,
      description: content.description,
      accent: course.accent || "#7B2FF7",
      focus_area: mod.title,
      modules,
      exam_case: examCase,
      created_by: user.id,
    }).select().single();
    if (error) return res.status(500).json({ error: error.message });

    return res.status(200).json({ course: data });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message || "Unbekannter Fehler." });
  }
}

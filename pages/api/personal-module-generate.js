import { requireUser } from "../../lib/supabaseServer";
import { getAdminSupabase } from "../../lib/supabaseAdmin";
import { callAI } from "../../lib/aiClient";
import { COURSES } from "../../lib/curriculum";

export const config = { maxDuration: 45 };

function findModule(courseId, moduleId) {
  const course = COURSES.find((c) => c.id === courseId);
  const mod = course?.modules.find((m) => m.id === moduleId);
  return course && mod ? { course, mod } : null;
}

// Wählt das Modul mit der schwächsten Quote (mc+open Score/Total). Bei
// perfekten Ergebnissen (z.B. ein frisch "abgeschlossener" Admin-Account)
// gibt es keine echte Schwäche — dann wird dasselbe Modul einfach als
// Vertiefungs-Thema statt als Aufholbedarf gerahmt (siehe unten).
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
    if (!canManageOthers) return res.status(403).json({ error: "Nur Manager/Admins können Module für andere generieren." });
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

    // Ohne jedes Ergebnis (noch keine Prüfung gemacht) auf ein zufälliges
    // Grundlagen-Thema ausweichen, damit die Generierung trotzdem funktioniert.
    const fallback = { course: COURSES[0], mod: COURSES[0].modules[0] };
    const { course, mod } = found || fallback;
    const isWeak = weakest !== null && weakest.ratio < 0.75;

    const raw = await callAI(
      "Du erstellst ein kurzes, individuelles Zusatzlernmodul für einen Vertriebler auf einer Vertriebstrainings-Plattform, " +
        "basierend auf einem bereits behandelten Thema. " +
        (isWeak
          ? "Die Person hatte bei genau diesem Thema nachweislich Schwierigkeiten — das Modul soll das Thema noch einmal " +
            "klar und ermutigend erklären (kein belehrender Ton), mit Fokus auf die Punkte, die typischerweise verwechselt " +
            "oder falsch verstanden werden."
          : "Die Person beherrscht die Grundlagen bereits gut — das Modul soll als VERTIEFUNG dienen, mit einem " +
            "fortgeschritteneren Blickwinkel auf das Thema (z.B. eine kniffligere Situation oder ein Nuance-Aspekt), " +
            "nicht nur eine Wiederholung.") +
        " Antworte AUSSCHLIESSLICH als valides JSON-Objekt, auf Deutsch: " +
        '{"title": "<kurzer, konkreter Titel>", "focus_area": "<2-4 Worte Kernthema>", ' +
        '"theory": "<2 kurze Absätze>", "question": "<1 offene Reflexions-/Übungsfrage zum Anwenden>"}. Kein Text außerhalb des JSON.',
      [{ role: "user", content: `Kurs: ${course.title}\nModul: ${mod.title}\n\n${mod.theory}` }],
      900
    );

    let content;
    try {
      content = JSON.parse(raw.replace(/```json|```/g, "").trim());
    } catch (e) {
      return res.status(500).json({ error: "Die KI-Antwort konnte nicht gelesen werden. Bitte erneut versuchen." });
    }
    if (!content.title || !content.theory || !content.question) {
      return res.status(500).json({ error: "Unvollständige KI-Antwort. Bitte erneut versuchen." });
    }

    const { data, error } = await admin.from("personal_modules").insert({
      user_id: target,
      title: content.title,
      focus_area: content.focus_area || mod.title,
      theory: content.theory,
      question: content.question,
      source_course_id: course.id,
      source_module_id: mod.id,
      created_by: user.id,
    }).select().single();
    if (error) return res.status(500).json({ error: error.message });

    return res.status(200).json({ module: data });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message || "Unbekannter Fehler." });
  }
}

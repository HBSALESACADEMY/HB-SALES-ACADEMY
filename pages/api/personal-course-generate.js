import { requireUser } from "../../lib/supabaseServer";
import { getAdminSupabase } from "../../lib/supabaseAdmin";
import { generatePersonalCourseFor } from "../../lib/generatePersonalCourse";

// Ein vollständiger Kurs (3 Module × Theorie+6 MC+offene Frage, plus
// Abschlussprüfung) ist deutlich mehr Text als die bisherigen Generatoren —
// entsprechend mehr Zeit für Gemini einplanen.
export const config = { maxDuration: 60 };

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
    const data = await generatePersonalCourseFor(admin, target, user.id);
    return res.status(200).json({ course: data });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message || "Unbekannter Fehler." });
  }
}

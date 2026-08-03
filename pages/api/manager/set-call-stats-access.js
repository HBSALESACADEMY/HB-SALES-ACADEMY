import { requireUser } from "../../../lib/supabaseServer";
import { getAdminSupabase } from "../../../lib/supabaseAdmin";

// Setzt profiles.can_view_call_stats für ein TEAM-MITGLIED — muss über den
// Admin-Client laufen, da die einzige update-Policy auf profiles nur das
// eigene Profil erlaubt (auth.uid() = id). Ein Manager kann also nicht
// direkt mit dem normalen Client das Profil eines Mitglieds ändern; das
// schlug bisher RLS-bedingt still fehl, während die UI trotzdem
// "erfolgreich" anzeigte.
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const auth = await requireUser(req, res);
  if (!auth) return;

  const { memberId, allow } = req.body || {};
  if (!memberId || typeof allow !== "boolean") return res.status(400).json({ error: "memberId und allow erforderlich." });

  const admin = getAdminSupabase();

  try {
    const { data: isLead } = await admin.rpc("is_team_lead_of", { target_id: memberId, viewer_id: auth.user.id });
    if (!isLead) return res.status(403).json({ error: "Nur der Teamlead darf das für dieses Mitglied ändern." });

    const { error } = await admin.from("profiles").update({ can_view_call_stats: allow }).eq("id", memberId);
    if (error) throw error;

    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Fehler beim Speichern." });
  }
}

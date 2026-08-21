import { requireUser } from "../../../lib/supabaseServer";
import { getAdminSupabase } from "../../../lib/supabaseAdmin";
import { aktiveOrgId } from "../../../lib/aktiveOrgServer";
import { istFuehrungsrolle } from "../../../lib/rollen";

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
    // Teamleitung ODER Führungsrolle derselben Organisation — sonst kann ein
    // Manager die Teams seiner Organisation zwar verwalten (migration_103),
    // aber diese eine Freigabe nicht setzen.
    const { data: isLead } = await admin.rpc("is_team_lead_of", { target_id: memberId, viewer_id: auth.user.id });
    const { data: ich } = await auth.client.from("profiles")
      .select("role, is_admin, is_platform_admin, organization_id").eq("id", auth.user.id).maybeSingle();
    const istFuehrung = istFuehrungsrolle(ich);
    if (!isLead && istFuehrung) {
      const { data: ziel } = await admin.from("profiles").select("organization_id").eq("id", memberId).maybeSingle();
      const meineOrg = await aktiveOrgId(admin, ich, auth.user.id);
      if (!ziel || (ziel.organization_id !== meineOrg && !ich.is_platform_admin)) {
        return res.status(403).json({ error: "Diese Person gehört zu einer anderen Organisation." });
      }
    } else if (!isLead) {
      return res.status(403).json({ error: "Das darf nur die Teamleitung oder eine Führungsrolle der Organisation ändern." });
    }

    const { error } = await admin.from("profiles").update({ can_view_call_stats: allow }).eq("id", memberId);
    if (error) throw error;

    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Fehler beim Speichern." });
  }
}

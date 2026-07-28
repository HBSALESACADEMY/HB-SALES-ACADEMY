import { requireUser } from "../../../lib/supabaseServer";
import { getAdminSupabase } from "../../../lib/supabaseAdmin";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const auth = await requireUser(req, res);
  if (!auth) return;
  const { client, user } = auth;

  const { data: me } = await client.from("profiles").select("role, is_admin, is_platform_admin, organization_id").eq("id", user.id).maybeSingle();
  if (!me || (me.role !== "manager" && !me.is_platform_admin)) {
    return res.status(403).json({ error: "Nur Manager können die Nutzerverwaltung sehen." });
  }

  try {
    const admin = getAdminSupabase();

    // Service-Role umgeht RLS komplett — organization_id muss hier deshalb
    // explizit gefiltert werden, sonst sähe jeder Manager jede Organisation.
    // Ausnahme: Plattform-Admins sehen bewusst organisationsübergreifend alle Nutzer.
    let query = admin.from("profiles").select("*").order("created_at", { ascending: true });
    if (!me.is_platform_admin) query = query.eq("organization_id", me.organization_id);
    const { data: profiles, error: profilesError } = await query;
    if (profilesError) throw profilesError;

    // auth.users holds email addresses; profiles table doesn't store them.
    const { data: authList, error: authError } = await admin.auth.admin.listUsers({ perPage: 1000 });
    if (authError) throw authError;

    const emailById = new Map(authList.users.map((u) => [u.id, u.email]));

    let orgNameById = new Map();
    if (me.is_platform_admin) {
      const { data: orgs } = await admin.from("organizations").select("id, name");
      orgNameById = new Map((orgs || []).map((o) => [o.id, o.name]));
    }

    // "Teamleiter" ist keine eigene Rolle, sondern rein informativ: wer
    // mindestens ein Team gegründet hat (teams.created_by).
    const { data: teams } = await admin.from("teams").select("created_by");
    const teamLeadIds = new Set((teams || []).map((t) => t.created_by));

    const users = (profiles || []).map((p) => ({
      ...p,
      email: emailById.get(p.id) || null,
      organization_name: me.is_platform_admin ? (orgNameById.get(p.organization_id) || null) : undefined,
      is_team_lead: teamLeadIds.has(p.id),
    }));

    return res.status(200).json({ users, selfId: user.id, isAdmin: !!me.is_admin, isPlatformAdmin: !!me.is_platform_admin });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Fehler beim Laden der Nutzer." });
  }
}

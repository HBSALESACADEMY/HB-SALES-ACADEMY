import { requireUser } from "../../../lib/supabaseServer";
import { getAdminSupabase } from "../../../lib/supabaseAdmin";
import { aktiveOrgId } from "../../../lib/aktiveOrgServer";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const auth = await requireUser(req, res);
  if (!auth) return;
  const { client, user } = auth;

  const { data: me } = await client.from("profiles").select("role, is_admin, is_platform_admin, organization_id").eq("id", user.id).maybeSingle();
  // is_admin gehört dazu: "Admin der Organisation" ist genau die Rolle, die
  // Nutzer freischaltet. Vorher war ausgesperrt, wer als Admin gekennzeichnet
  // ist, aber nicht zusätzlich role='manager' trägt.
  if (!me || (me.role !== "manager" && !me.is_admin && !me.is_platform_admin)) {
    return res.status(403).json({ error: "Nur Manager können die Nutzerverwaltung sehen." });
  }

  try {
    const admin = getAdminSupabase();

    // Service-Role umgeht RLS komplett — organization_id muss hier deshalb
    // explizit gefiltert werden, sonst sähe jeder Manager jede Organisation.
    //
    // Auch Plattform-Admins: früher entfiel der Filter für sie ganz, und sie
    // sahen die Nutzer ALLER Organisationen auf einmal. Jetzt gilt auch für
    // sie die aktive Organisation — die per Firmencode gewählte, sonst die
    // eigene (migration_92).
    const orgId = await aktiveOrgId(admin, me, user.id);
    if (!orgId) return res.status(400).json({ error: "Keine aktive Organisation." });
    const { data: profiles, error: profilesError } = await admin.from("profiles")
      .select("*").eq("organization_id", orgId).order("created_at", { ascending: true });
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

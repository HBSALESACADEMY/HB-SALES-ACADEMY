import { requireUser } from "../../../lib/supabaseServer";
import { getAdminSupabase } from "../../../lib/supabaseAdmin";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const auth = await requireUser(req, res);
  if (!auth) return;
  const { client, user } = auth;

  const { data: me } = await client.from("profiles").select("role, is_admin, organization_id").eq("id", user.id).maybeSingle();
  if (!me || me.role !== "manager") {
    return res.status(403).json({ error: "Nur Manager können die Nutzerverwaltung sehen." });
  }

  try {
    const admin = getAdminSupabase();

    // Service-Role umgeht RLS komplett — organization_id muss hier deshalb
    // explizit gefiltert werden, sonst sähe jeder Manager jede Organisation.
    const { data: profiles, error: profilesError } = await admin
      .from("profiles")
      .select("*")
      .eq("organization_id", me.organization_id)
      .order("created_at", { ascending: true });
    if (profilesError) throw profilesError;

    // auth.users holds email addresses; profiles table doesn't store them.
    const { data: authList, error: authError } = await admin.auth.admin.listUsers({ perPage: 1000 });
    if (authError) throw authError;

    const emailById = new Map(authList.users.map((u) => [u.id, u.email]));
    const users = (profiles || []).map((p) => ({ ...p, email: emailById.get(p.id) || null }));

    return res.status(200).json({ users, selfId: user.id, isAdmin: !!me.is_admin });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Fehler beim Laden der Nutzer." });
  }
}

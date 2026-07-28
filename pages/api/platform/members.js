import { requireUser } from "../../../lib/supabaseServer";
import { getAdminSupabase } from "../../../lib/supabaseAdmin";

// Nur für Houmans Plattform-Admin-Konto: Mitgliederliste ÜBER alle
// Organisationen hinweg (normale Nutzer sehen per RLS nur ihre eigene
// Organisation — das ist hier bewusst, deshalb Service-Role + expliziter Check).
export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const auth = await requireUser(req, res);
  if (!auth) return;
  const { client, user } = auth;

  const { data: me } = await client.from("profiles").select("is_platform_admin").eq("id", user.id).maybeSingle();
  if (!me?.is_platform_admin) return res.status(403).json({ error: "Nur für Plattform-Admins verfügbar." });

  try {
    const admin = getAdminSupabase();
    const [{ data: profiles, error: profilesError }, { data: orgs, error: orgsError }] = await Promise.all([
      admin.from("profiles").select("id, full_name, role, is_admin, status, organization_id").order("full_name"),
      admin.from("organizations").select("id, name").order("name"),
    ]);
    if (profilesError) throw profilesError;
    if (orgsError) throw orgsError;

    return res.status(200).json({ members: profiles || [], organizations: orgs || [] });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Fehler beim Laden der Mitglieder." });
  }
}

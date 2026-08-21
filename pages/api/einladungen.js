import { requireUser } from "../../lib/supabaseServer";
import { getAdminSupabase } from "../../lib/supabaseAdmin";
import { aktiveOrgId } from "../../lib/aktiveOrgServer";
import { offeneEinladungenFuer } from "../../lib/einladungenServer";

// Die offenen Einladungen der angemeldeten Person — für das Dashboard.
//
// Über eine Route, weil Titel und Zeitpunkt in Tabellen stehen, auf die
// eine eingeladene Person nicht zwingend Zugriff hat (siehe
// lib/einladungenServer.js). Zu- und abgesagt wird direkt über die
// Datenbank: das darf nur die eingeladene Person selbst (migration_112).
export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  const auth = await requireUser(req, res);
  if (!auth) return;

  try {
    const admin = getAdminSupabase();
    const { data: ich } = await auth.client.from("profiles")
      .select("organization_id, is_platform_admin").eq("id", auth.user.id).maybeSingle();
    const orgId = await aktiveOrgId(admin, ich, auth.user.id);
    if (!orgId) return res.status(200).json({ einladungen: [] });

    return res.status(200).json({ einladungen: await offeneEinladungenFuer(admin, auth.user.id, orgId) });
  } catch (e) {
    console.error("Einladungen konnten nicht geladen werden:", e.message);
    return res.status(500).json({ error: e.message });
  }
}

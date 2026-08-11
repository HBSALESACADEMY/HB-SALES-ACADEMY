import { requireUser } from "../../lib/supabaseServer";
import { getAdminSupabase } from "../../lib/supabaseAdmin";
import { notifyOrgManagers, notifyPlatformAdmins } from "../../lib/notifyManagers";

// Wird direkt nach einer erfolgreichen Registrierung vom Client aufgerufen
// (siehe pages/login.js) — benachrichtigt die Manager/Admins der Organisation
// per E-Mail, dass ein neues Konto auf Freigabe wartet.
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const auth = await requireUser(req, res);
  if (!auth) return;
  const { client, user } = auth;

  try {
    const { data: me } = await client.from("profiles").select("full_name, organization_id").eq("id", user.id).maybeSingle();
    if (!me?.organization_id) return res.status(200).json({ ok: true });

    const admin = getAdminSupabase();
    const { data: org } = await admin.from("organizations").select("name").eq("id", me.organization_id).maybeSingle();
    const orgName = org?.name || "eurer Organisation";
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";

    const html = `<p><strong>${me.full_name || "Ein neuer Nutzer"}</strong> hat sich bei ${orgName} registriert und wartet auf Freigabe.</p>` +
      (appUrl ? `<p><a href="${appUrl}/admin" target="_blank" rel="noopener noreferrer">Jetzt freigeben →</a></p>` : "");

    // Org-Manager (nur diese Organisation) + zusätzlich alle Plattform-
    // Admin-Konten (organisationsübergreifend), damit der Plattform-Betreiber
    // über jede Freischaltung informiert bleibt, nicht nur die jeweilige
    // Organisation selbst.
    await Promise.all([
      notifyOrgManagers(admin, me.organization_id, { subject: `Neue Registrierung wartet auf Freigabe — ${orgName}`, html, fromName: orgName }),
      notifyPlatformAdmins(admin, { subject: `Neue Registrierung wartet auf Freigabe — ${orgName}`, html, fromName: orgName }),
    ]);

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error(e);
    // Best-effort — darf die Registrierung selbst nie blockieren.
    return res.status(200).json({ ok: true });
  }
}

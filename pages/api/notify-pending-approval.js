import { requireUser } from "../../lib/supabaseServer";
import { getAdminSupabase } from "../../lib/supabaseAdmin";
import { notifyOrgManagers } from "../../lib/notifyManagers";

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

    await notifyOrgManagers(admin, me.organization_id, {
      subject: `Neue Registrierung wartet auf Freigabe — ${orgName}`,
      html: `<p><strong>${me.full_name || "Ein neuer Nutzer"}</strong> hat sich bei ${orgName} registriert und wartet auf Freigabe.</p>` +
        (appUrl ? `<p><a href="${appUrl}/admin">Jetzt freigeben</a></p>` : ""),
    });

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error(e);
    // Best-effort — darf die Registrierung selbst nie blockieren.
    return res.status(200).json({ ok: true });
  }
}

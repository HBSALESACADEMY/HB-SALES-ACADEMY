import { requireUser } from "../../../lib/supabaseServer";
import { getAdminSupabase } from "../../../lib/supabaseAdmin";

function slugify(name) {
  return name
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Legt eine neue Organisation UND direkt den zugehörigen Organisations-Manager-
// Account an (E-Mail+Passwort). Läuft bewusst über Service-Role: Ein neuer
// Auth-Nutzer mit Passwort kann nicht über den normalen Client erstellt werden,
// ohne die aktuelle Sitzung des Plattform-Admins zu verlieren.
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const auth = await requireUser(req, res);
  if (!auth) return;
  const { client, user } = auth;

  const { data: me } = await client.from("profiles").select("is_platform_admin").eq("id", user.id).maybeSingle();
  if (!me?.is_platform_admin) return res.status(403).json({ error: "Nur für Plattform-Admins verfügbar." });

  const { name, managerName, managerEmail, managerPassword } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ error: "Firmenname erforderlich." });
  if (!managerName || !managerName.trim()) {
    return res.status(400).json({ error: "Name des Organisations-Managers erforderlich." });
  }
  if (!managerEmail || !managerEmail.trim() || !managerPassword) {
    return res.status(400).json({ error: "E-Mail und Passwort für den Organisations-Manager erforderlich." });
  }
  if (managerPassword.length < 6) {
    return res.status(400).json({ error: "Das Passwort muss mindestens 6 Zeichen lang sein." });
  }

  const admin = getAdminSupabase();
  const base = slugify(name.trim()) || "firma";
  let candidateSlug = base;
  let org = null;

  try {
    for (let attempt = 1; attempt <= 20 && !org; attempt++) {
      const { data, error } = await admin.from("organizations").insert({ name: name.trim(), slug: candidateSlug }).select().maybeSingle();
      if (!error) { org = data; break; }
      if (error.code === "23505") { candidateSlug = `${base}-${attempt + 1}`; continue; }
      throw error;
    }
    if (!org) throw new Error("Konnte keinen eindeutigen Firmencode finden.");

    // org_slug in den Metadaten lässt den bestehenden handle_new_user()-Trigger
    // das Profil automatisch der richtigen Organisation zuordnen — genau wie
    // bei einer normalen Registrierung über die Login-Seite.
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email: managerEmail.trim(),
      password: managerPassword,
      email_confirm: true,
      user_metadata: { full_name: managerName.trim(), org_slug: org.slug },
    });
    if (createErr) {
      await admin.from("organizations").delete().eq("id", org.id);
      throw createErr;
    }

    const { error: profileErr } = await admin.from("profiles").update({
      role: "manager",
      is_admin: true,
      status: "approved",
    }).eq("id", created.user.id);
    if (profileErr) throw profileErr;

    return res.status(200).json({ org, managerId: created.user.id });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Fehler beim Anlegen der Organisation." });
  }
}

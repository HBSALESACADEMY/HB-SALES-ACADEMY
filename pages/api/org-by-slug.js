import { getAdminSupabase } from "../../lib/supabaseAdmin";

// Bewusst OHNE requireUser: wird auf der Login-Seite aufgerufen, bevor eine
// Sitzung existiert. Service-Role ist hier nötig, weil organizations RLS
// (organizations_select_own) den eigenen profiles.organization_id braucht,
// den es vor dem Login noch nicht gibt. Liefert nur nicht-sensible
// Branding-Felder zurück, keine Nutzer-/Kundendaten.
export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const slug = (req.query.slug || "").trim();
  if (!slug) return res.status(400).json({ error: "Firmencode fehlt." });

  try {
    const admin = getAdminSupabase();
    const { data, error } = await admin
      .from("organizations")
      .select("name, slug, logo_url, primary_color")
      .eq("slug", slug)
      .maybeSingle();
    if (error) return res.status(500).json({ error: error.message });
    if (!data) return res.status(404).json({ error: "Unbekannter Firmen-Code." });

    return res.status(200).json({ org: data });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Unbekannter Fehler." });
  }
}

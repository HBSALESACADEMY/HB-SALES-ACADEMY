import { requireUser } from "../../lib/supabaseServer";
import { getAdminSupabase } from "../../lib/supabaseAdmin";
import { darfOrganigrammSehen } from "./org-chart";

// Setzt die Rollenbezeichnung einer Person (profiles.role_title) aus dem
// Organigramm heraus.
//
// Muss über den Admin-Client laufen: die einzige update-Regel auf profiles
// erlaubt nur das eigene Profil (auth.uid() = id). Ohne diese Route hätte
// die Änderung im Organigramm still fehlgeschlagen, während die Oberfläche
// Erfolg anzeigt — dieselbe Falle wie bei set-call-stats-access.js.
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const auth = await requireUser(req, res);
  if (!auth) return;

  const { personId, rolle } = req.body || {};
  if (!personId || typeof rolle !== "string") return res.status(400).json({ error: "personId und rolle erforderlich." });
  if (rolle.length > 60) return res.status(400).json({ error: "Die Rollenbezeichnung darf höchstens 60 Zeichen haben." });

  const { darf, profil } = await darfOrganigrammSehen(auth.client, auth.user.id);
  if (!darf) return res.status(403).json({ error: "Nur Führungsrollen dürfen Rollenbezeichnungen ändern." });

  try {
    const admin = getAdminSupabase();
    // Mandanten-Grenze: nur Personen der eigenen Organisation. Plattform-
    // Admins dürfen organisationsübergreifend.
    const { data: ziel } = await admin.from("profiles").select("organization_id").eq("id", personId).maybeSingle();
    if (!ziel) return res.status(404).json({ error: "Person nicht gefunden." });
    if (!profil?.is_platform_admin && ziel.organization_id !== profil?.organization_id) {
      return res.status(403).json({ error: "Diese Person gehört zu einer anderen Organisation." });
    }

    const { error } = await admin.from("profiles").update({ role_title: rolle.trim() || null }).eq("id", personId);
    if (error) throw error;
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

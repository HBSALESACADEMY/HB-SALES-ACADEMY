import { requireUser } from "../../lib/supabaseServer";
import { getAdminSupabase } from "../../lib/supabaseAdmin";

// Erzeugt eine kurzlebige signierte URL für die hochgeladene Anruf-Aufnahme
// eines Leads. Der lead-recordings-Bucket ist privat und nur für den/die
// Ersteller:in per Storage-RLS lesbar — diese Route erlaubt zusätzlich
// Managern/Admins derselben Organisation sowie Plattform-Admins den Zugriff,
// mit derselben Berechtigungslogik wie die leads-Tabellen-RLS.
export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  const auth = await requireUser(req, res);
  if (!auth) return;
  const { client, user } = auth;

  const { leadId } = req.query;
  if (!leadId) return res.status(400).json({ error: "leadId erforderlich." });

  try {
    const admin = getAdminSupabase();
    const { data: lead } = await admin.from("leads").select("created_by, recording_path").eq("id", leadId).maybeSingle();
    if (!lead || !lead.recording_path) return res.status(404).json({ error: "Keine Aufnahme gefunden." });

    if (lead.created_by !== user.id) {
      const { data: me } = await client.from("profiles").select("role, is_admin, is_platform_admin, organization_id").eq("id", user.id).maybeSingle();
      const { data: owner } = await admin.from("profiles").select("organization_id").eq("id", lead.created_by).maybeSingle();
      const isManagerOfOrg = me && (me.role === "manager" || me.role === "backend" || me.is_admin) && owner && owner.organization_id === me.organization_id;
      // Deckungsgleich mit der leads_select-RLS (migration_77): wer eine
      // Aufgabe zugewiesen bekommen hat oder erwähnt wurde, darf den Termin
      // sehen — sonst wäre "Aufnahme abspielen" für diese Personen ein
      // toter Button (403), obwohl der Termin selbst sichtbar ist.
      let hasTaskOrMention = false;
      if (!me?.is_platform_admin && !isManagerOfOrg) {
        const [{ data: task }, { data: mention }] = await Promise.all([
          admin.from("lead_tasks").select("id").eq("lead_id", leadId).eq("assigned_to", user.id).limit(1).maybeSingle(),
          admin.from("lead_mentions").select("id").eq("lead_id", leadId).eq("user_id", user.id).limit(1).maybeSingle(),
        ]);
        hasTaskOrMention = !!(task || mention);
      }
      if (!me?.is_platform_admin && !isManagerOfOrg && !hasTaskOrMention) {
        return res.status(403).json({ error: "Kein Zugriff auf diese Aufnahme." });
      }
    }

    const { data, error } = await admin.storage.from("lead-recordings").createSignedUrl(lead.recording_path, 3600);
    if (error) throw error;

    return res.status(200).json({ url: data.signedUrl });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Fehler beim Abrufen der Aufnahme." });
  }
}

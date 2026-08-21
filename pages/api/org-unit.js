import { requireUser } from "../../lib/supabaseServer";
import { getAdminSupabase } from "../../lib/supabaseAdmin";
import { darfOrganigrammSehen } from "./org-chart";
import { aktiveOrgId } from "../../lib/aktiveOrgServer";

// Anlegen, Umbenennen, Löschen von Organisationseinheiten und das Zuordnen
// von Teams (migration_98).
//
// Über eine Route statt direkt aus dem Browser, damit die Organisation aus
// active_org kommt und nicht aus der Anfrage — sonst liesse sich eine
// Einheit in einer fremden Organisation anlegen.
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const auth = await requireUser(req, res);
  if (!auth) return;

  const { darf, profil } = await darfOrganigrammSehen(auth.client, auth.user.id);
  if (!darf) return res.status(403).json({ error: "Nur Führungsrollen dürfen die Struktur ändern." });

  const admin = getAdminSupabase();
  const orgId = await aktiveOrgId(admin, profil, auth.user.id);
  if (!orgId) return res.status(400).json({ error: "Keine aktive Organisation." });

  const { aktion, id, name, parentId, teamId, einheitId } = req.body || {};

  try {
    if (aktion === "anlegen") {
      if (!name?.trim()) return res.status(400).json({ error: "Name erforderlich." });
      // Übergeordnete Einheit muss zur selben Organisation gehören.
      if (parentId) {
        const { data: eltern } = await admin.from("org_units").select("organization_id").eq("id", parentId).maybeSingle();
        if (eltern?.organization_id !== orgId) return res.status(400).json({ error: "Übergeordnete Einheit gehört zu einer anderen Organisation." });
      }
      const { data, error } = await admin.from("org_units")
        .insert({ organization_id: orgId, name: name.trim().slice(0, 80), parent_id: parentId || null })
        .select().single();
      if (error) throw error;
      return res.status(200).json({ ok: true, einheit: data });
    }

    if (aktion === "umbenennen") {
      if (!id || !name?.trim()) return res.status(400).json({ error: "id und Name erforderlich." });
      const { error } = await admin.from("org_units").update({ name: name.trim().slice(0, 80) })
        .eq("id", id).eq("organization_id", orgId);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    if (aktion === "loeschen") {
      if (!id) return res.status(400).json({ error: "id erforderlich." });
      // Untereinheiten verschwinden mit (on delete cascade); zugeordnete
      // Teams bleiben bestehen und stehen wieder unter "Nicht zugeordnet".
      const { error } = await admin.from("org_units").delete().eq("id", id).eq("organization_id", orgId);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    if (aktion === "team-zuordnen") {
      if (!teamId) return res.status(400).json({ error: "teamId erforderlich." });
      const { data: team } = await admin.from("teams").select("organization_id").eq("id", teamId).maybeSingle();
      if (team?.organization_id !== orgId) return res.status(403).json({ error: "Dieses Team gehört zu einer anderen Organisation." });
      if (einheitId) {
        const { data: einheit } = await admin.from("org_units").select("organization_id").eq("id", einheitId).maybeSingle();
        if (einheit?.organization_id !== orgId) return res.status(400).json({ error: "Einheit gehört zu einer anderen Organisation." });
      }
      const { error } = await admin.from("teams").update({ org_unit_id: einheitId || null }).eq("id", teamId);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: "Unbekannte Aktion." });
  } catch (e) {
    console.error("Struktur-Änderung fehlgeschlagen:", e.message);
    return res.status(500).json({ error: e.message });
  }
}

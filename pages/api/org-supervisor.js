import { requireUser } from "../../lib/supabaseServer";
import { getAdminSupabase } from "../../lib/supabaseAdmin";
import { darfOrganigrammSehen } from "./org-chart";
import { aktiveOrgId } from "../../lib/aktiveOrgServer";

// Legt fest, unter wem eine Person im Organigramm hängt (migration_100).
//
// Über den Admin-Client, weil die einzige update-Regel auf profiles nur das
// eigene Profil erlaubt — und weil niemand für sich selbst bestimmen soll,
// wem er unterstellt ist.
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const auth = await requireUser(req, res);
  if (!auth) return;

  const { darf, profil } = await darfOrganigrammSehen(auth.client, auth.user.id);
  if (!darf) return res.status(403).json({ error: "Nur Führungsrollen dürfen das Organigramm ändern." });

  const { personId, vorgesetzterId, aktion } = req.body || {};
  if (!personId) return res.status(400).json({ error: "personId erforderlich." });
  if (personId === vorgesetzterId) return res.status(400).json({ error: "Eine Person kann sich nicht selbst unterstellt sein." });

  try {
    const admin = getAdminSupabase();
    const orgId = await aktiveOrgId(admin, profil, auth.user.id);
    if (!orgId) return res.status(400).json({ error: "Keine aktive Organisation." });

    const { data: person } = await admin.from("profiles").select("organization_id").eq("id", personId).maybeSingle();
    if (!person) return res.status(404).json({ error: "Person nicht gefunden." });
    if (person.organization_id !== orgId) return res.status(403).json({ error: "Diese Person gehört zu einer anderen Organisation." });

    if (vorgesetzterId) {
      const { data: chef } = await admin.from("profiles").select("organization_id").eq("id", vorgesetzterId).maybeSingle();
      // Die vorgesetzte Person darf auch aus einer anderen Organisation sein
      // — ein Plattform-Admin, der ein Kundenteam führt, gehört selbst
      // woanders hin (siehe migration_93).
      if (!chef) return res.status(404).json({ error: "Vorgesetzte Person nicht gefunden." });

      // Ringschluss verhindern: sonst hätte der Baum keine Wurzel und die
      // Anzeige liefe endlos.
      const { data: alle } = await admin.from("profiles").select("id, vorgesetzter_id");
      const chefVon = new Map((alle || []).map((p) => [p.id, p.vorgesetzter_id]));
      chefVon.set(personId, vorgesetzterId);
      const gesehen = new Set();
      let lauf = personId;
      while (lauf) {
        if (gesehen.has(lauf)) {
          return res.status(400).json({ error: "Das ergäbe einen Kreis — diese Person steht bereits über der gewählten." });
        }
        gesehen.add(lauf);
        lauf = chefVon.get(lauf) || null;
      }
    }

    // Zusätzliche Zuordnung (migration_101): die Hauptzuordnung bleibt, es
    // kommt nur eine weitere Linie dazu.
    if (aktion === "zusatz-hinzufuegen") {
      if (!vorgesetzterId) return res.status(400).json({ error: "Bitte eine Person auswählen." });
      const { error } = await admin.from("org_zusatz_chefs")
        .upsert({ person_id: personId, chef_id: vorgesetzterId }, { onConflict: "person_id,chef_id" });
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }
    if (aktion === "zusatz-entfernen") {
      const { error } = await admin.from("org_zusatz_chefs")
        .delete().eq("person_id", personId).eq("chef_id", vorgesetzterId);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    const { error } = await admin.from("profiles").update({ vorgesetzter_id: vorgesetzterId || null }).eq("id", personId);
    if (error) throw error;
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error("Zuordnung fehlgeschlagen:", e.message);
    return res.status(500).json({ error: e.message });
  }
}

import { requireUser } from "../../lib/supabaseServer";
import { getAdminSupabase } from "../../lib/supabaseAdmin";
import { aktiveOrgId } from "../../lib/aktiveOrgServer";
import { goalMetric } from "../../lib/goalMetrics";

// Legt ein Ziel an — mit ausdrücklicher Rechteprüfung statt allein über die
// Zugriffsregeln.
//
// Vorher lief der Insert direkt aus dem Browser. Ob er durchging, hing an
// mehreren ineinandergreifenden Bedingungen (kann_team_verwalten,
// aktive_org, Mitgliedschaft) — scheiterte eine, kam nur "new row violates
// row-level security policy", ohne zu sagen, welche. Hier wird jede
// Bedingung einzeln geprüft und benannt.
export const config = { maxDuration: 20 };

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const auth = await requireUser(req, res);
  if (!auth) return;
  const { user, client } = auth;

  const { teamId, title, metric, target, von, bis, personId } = req.body || {};
  if (!teamId || !title?.trim() || !target) return res.status(400).json({ error: "Team, Titel und Zielwert sind erforderlich." });
  if (!goalMetric(metric)) return res.status(400).json({ error: "Unbekannte Kennzahl." });
  if (!von || !bis || bis < von) return res.status(400).json({ error: "Der Zeitraum ist ungültig — das Ende darf nicht vor dem Beginn liegen." });

  try {
    const admin = getAdminSupabase();
    const { data: ich } = await client.from("profiles")
      .select("organization_id, is_admin, is_platform_admin, role").eq("id", user.id).maybeSingle();
    if (!ich) return res.status(403).json({ error: "Profil nicht gefunden." });

    const { data: team } = await admin.from("teams").select("id, name, created_by, organization_id").eq("id", teamId).maybeSingle();
    if (!team) return res.status(404).json({ error: "Team nicht gefunden." });

    const orgId = await aktiveOrgId(admin, ich, user.id);
    if (team.organization_id && orgId && team.organization_id !== orgId) {
      return res.status(403).json({ error: `„${team.name}“ gehört zu einer anderen Organisation als der, in der du gerade angemeldet bist. Melde dich mit dem passenden Firmencode an.` });
    }

    const istLeitung = team.created_by === user.id;
    // Gleichgezogen mit migration_103: jede Führungsrolle der Organisation
    // darf die Teams ihrer Organisation verwalten, nicht nur Admins.
    const istFuehrung = ich.role === "manager" || ich.role === "backend" || !!ich.is_admin || !!ich.is_platform_admin;
    const darfVerwalten = istLeitung || istFuehrung;

    // Persönliches Ziel für sich selbst darf jede Person setzen, die im Team
    // ist. Alles andere — Team-Ziele und Ziele für andere — nur die Leitung.
    const fuerSichSelbst = personId && personId === user.id;
    if (!darfVerwalten && !fuerSichSelbst) {
      return res.status(403).json({ error: "Ziele für das Team darf nur die Teamleitung setzen. Ein Ziel für dich selbst kannst du anlegen." });
    }

    const { data: mitglied } = await admin.from("team_members")
      .select("user_id").eq("team_id", teamId).eq("user_id", personId || user.id).maybeSingle();
    if (fuerSichSelbst && !mitglied) {
      return res.status(403).json({ error: "Du bist in diesem Team nicht als Mitglied eingetragen — deshalb lässt sich hier kein eigenes Ziel setzen." });
    }
    if (personId && !fuerSichSelbst && !mitglied) {
      return res.status(400).json({ error: "Diese Person ist kein Mitglied des Teams." });
    }

    const { data: neu, error } = await admin.from("team_goals").insert({
      manager_id: user.id,
      team_id: teamId,
      title: String(title).trim().slice(0, 200),
      metric,
      target_count: Math.max(1, Math.round(Number(target) || 0)),
      starts_on: von,
      ends_on: bis,
      // Bleibt befüllt, damit nichts bricht, was noch danach fragt.
      week_start: von,
      user_id: personId || null,
    }).select().single();

    if (error) {
      // Die häufigsten Ursachen benennen, statt die rohe Meldung
      // durchzureichen.
      if (/column .*(starts_on|ends_on|user_id)/i.test(error.message)) {
        return res.status(500).json({ error: "In der Datenbank fehlen die Spalten für Zeitraum und Person (migration_96)." });
      }
      if (/team_goals_metric_check/i.test(error.message)) {
        return res.status(500).json({ error: "Diese Kennzahl kennt die Datenbank noch nicht (migration_99 fehlt)." });
      }
      throw error;
    }

    return res.status(200).json({ ok: true, ziel: neu });
  } catch (e) {
    console.error("Ziel anlegen fehlgeschlagen:", e.message);
    return res.status(500).json({ error: e.message || "Das Ziel konnte nicht angelegt werden." });
  }
}

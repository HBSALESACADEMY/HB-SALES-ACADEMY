import { requireUser } from "../../lib/supabaseServer";
import { getAdminSupabase } from "../../lib/supabaseAdmin";
import { aktiveOrgId } from "../../lib/aktiveOrgServer";
import { goalMetric } from "../../lib/goalMetrics";
import { istFuehrungsrolle } from "../../lib/rollen";

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

  const { aktion, zielId, teamId, title, metric, target, von, bis, personId } = req.body || {};

  // Ändern und Löschen laufen ebenfalls hierüber. Grund: über die
  // Zugriffsregeln kam bei jeder Ablehnung nur "Das Löschen wurde
  // abgelehnt", ohne zu sagen, WELCHE Bedingung nicht passte — Organisation,
  // Rolle oder eine fehlende Migration. Hier wird jede einzeln geprüft und
  // die tatsächlichen Werte werden genannt.
  if (aktion === "aendern" || aktion === "loeschen") {
    return await aendernOderLoeschen({ req, res, auth, aktion, zielId, title, target, bis });
  }

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
    const istFuehrung = istFuehrungsrolle(ich);
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

// Gemeinsame Rechteprüfung: Leitung des Teams, Führungsrolle derselben
// Organisation, oder das eigene persönliche Ziel.
async function darfZielVerwalten(admin, ich, userId, team, ziel) {
  if (ziel?.user_id && ziel.user_id === userId) return { ok: true };
  if (team.created_by === userId) return { ok: true };

  const istFuehrung = istFuehrungsrolle(ich);
  if (!istFuehrung) return { ok: false, grund: "Ziele für das Team darf nur die Teamleitung setzen oder ändern." };

  // Organisation des Teams mit Rückfall auf die der anlegenden Person —
  // Teams aus der Zeit vor migration_93 haben das Feld nicht gefüllt.
  let teamOrg = team.organization_id;
  if (!teamOrg) {
    const { data: ersteller } = await admin.from("profiles").select("organization_id").eq("id", team.created_by).maybeSingle();
    teamOrg = ersteller?.organization_id || null;
  }
  const meineOrg = await aktiveOrgId(admin, ich, userId);
  if (teamOrg && meineOrg && teamOrg !== meineOrg) {
    const namen = await admin.from("organizations").select("id, name").in("id", [teamOrg, meineOrg]);
    const nameVon = (id) => (namen.data || []).find((o) => o.id === id)?.name || "unbekannt";
    return { ok: false, grund: `Das Team gehört zu „${nameVon(teamOrg)}“, du bist gerade in „${nameVon(meineOrg)}“ angemeldet.` };
  }
  return { ok: true };
}

async function aendernOderLoeschen({ res, auth, aktion, zielId, title, target, bis }) {
  if (!zielId) return res.status(400).json({ error: "zielId erforderlich." });
  const admin = getAdminSupabase();
  const { data: ich } = await auth.client.from("profiles")
    .select("organization_id, is_admin, is_platform_admin, role").eq("id", auth.user.id).maybeSingle();
  if (!ich) return res.status(403).json({ error: "Profil nicht gefunden." });

  const { data: ziel } = await admin.from("team_goals").select("*").eq("id", zielId).maybeSingle();
  if (!ziel) return res.status(404).json({ error: "Ziel nicht gefunden." });
  const { data: team } = await admin.from("teams").select("id, name, created_by, organization_id").eq("id", ziel.team_id).maybeSingle();
  if (!team) return res.status(404).json({ error: "Team nicht gefunden." });

  const pruefung = await darfZielVerwalten(admin, ich, auth.user.id, team, ziel);
  if (!pruefung.ok) return res.status(403).json({ error: pruefung.grund });

  if (aktion === "loeschen") {
    const { error } = await admin.from("team_goals").delete().eq("id", zielId);
    if (error) throw error;
    return res.status(200).json({ ok: true });
  }

  if (!title?.trim() || !target) return res.status(400).json({ error: "Titel und Zielwert sind erforderlich." });
  const { error } = await admin.from("team_goals").update({
    title: String(title).trim().slice(0, 200),
    target_count: Math.max(1, Math.round(Number(target) || 0)),
    ends_on: bis || null,
  }).eq("id", zielId);
  if (error) throw error;
  return res.status(200).json({ ok: true });
}

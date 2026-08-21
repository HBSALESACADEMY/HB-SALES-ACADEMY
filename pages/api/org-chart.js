import { requireUser } from "../../lib/supabaseServer";
import { getAdminSupabase } from "../../lib/supabaseAdmin";

// Organigramm der Organisation.
//
// Die Struktur ergibt sich von selbst aus den Teams: gründet jemand aus
// meinem Team ein eigenes Team, hängt dieses Team unter meinem. Formal — ein
// Team B ist Untereinheit von Team A, wenn die Person, die B leitet,
// Mitglied von A ist. Es gibt also keine zweite, gepflegte Hierarchie, die
// mit der Wirklichkeit auseinanderlaufen könnte.
//
// Sichtbar für Führungsrollen (Manager, Backend, Admins) — nicht für alle,
// weil das Organigramm die gesamte Aufstellung der Organisation zeigt.
//
// Als Rollenbezeichnung dient profiles.role_title, dasselbe Feld wie im
// eigenen Profil. Eine zweite Bezeichnung nur fürs Organigramm hätte sonst
// dem widersprochen, was die Person selbst über sich schreibt.
export const config = { maxDuration: 20 };

export async function darfOrganigrammSehen(client, userId) {
  const { data: p } = await client.from("profiles")
    .select("role, is_admin, is_platform_admin, organization_id").eq("id", userId).maybeSingle();
  const darf = !!(p && (p.role === "manager" || p.role === "backend" || p.is_admin || p.is_platform_admin));
  return { darf, profil: p };
}

export default async function handler(req, res) {
  const auth = await requireUser(req, res);
  if (!auth) return;
  const { client, user } = auth;

  const { darf, profil } = await darfOrganigrammSehen(client, user.id);
  if (!darf) return res.status(403).json({ error: "Das Organigramm ist Führungsrollen vorbehalten." });

  const activeOrgId = req.query.activeOrgId || null;
  let orgId = profil?.organization_id || null;
  if (activeOrgId && (profil?.is_platform_admin || activeOrgId === profil?.organization_id)) orgId = activeOrgId;
  if (!orgId) return res.status(400).json({ error: "Keine Organisation gefunden." });

  try {
    const admin = getAdminSupabase();
    const { data: personen } = await admin.from("profiles")
      .select("id, full_name, avatar_url, role_title, role, is_admin, vorgesetzter_id").eq("organization_id", orgId);
    const idsDerOrg = new Set((personen || []).map((p) => p.id));
    const personVon = new Map((personen || []).map((p) => [p.id, p]));

    // Teams der Organisation: erkennbar daran, dass die leitende Person dazu
    // gehört. Teams fremder Organisationen bleiben so aussen vor.
    // Über teams.organization_id statt über die anlegende Person
    // (migration_93): ein per Firmencode angelegtes Team gehört der
    // Kundenorganisation, nicht der Heimat-Organisation des Plattform-Admins.
    const { data: alleTeams } = await admin.from("teams").select("id, name, created_by, organization_id, org_unit_id").eq("organization_id", orgId);
    const teams = alleTeams || [];
    const teamIds = teams.map((t) => t.id);

    const { data: mitgliedschaften } = teamIds.length
      ? await admin.from("team_members").select("team_id, user_id").in("team_id", teamIds)
      : { data: [] };

    // Namen für Personen nachladen, die zwar in einem Team dieser
    // Organisation stehen, aber selbst woanders hingehören — etwa ein
    // Plattform-Admin, der ein Kundenteam leitet. Ohne das stünde im
    // Organigramm "Unbenannt".
    const fehlend = Array.from(new Set([
      ...(mitgliedschaften || []).map((m) => m.user_id),
      ...teams.map((t) => t.created_by),
    ])).filter((id) => !personVon.has(id));
    if (fehlend.length) {
      const { data: extra } = await admin.from("profiles").select("id, full_name, avatar_url, role_title").in("id", fehlend);
      (extra || []).forEach((p2) => personVon.set(p2.id, p2));
    }
    const idsVon = new Map(teamIds.map((id) => [id, []]));
    (mitgliedschaften || []).forEach((m) => { if (idsVon.has(m.team_id)) idsVon.get(m.team_id).push(m.user_id); });

    // Übergeordnetes Team: dasjenige, in dem die leitende Person Mitglied ist.
    const elternVon = new Map();
    teams.forEach((t) => {
      const eltern = teams.find((p) => p.id !== t.id && (idsVon.get(p.id) || []).includes(t.created_by));
      elternVon.set(t.id, eltern?.id || null);
    });

    // Schleifen abfangen: leitet A ein Team, in dem B's Leitung sitzt, und
    // umgekehrt, gäbe es sonst keine Wurzel und die Anzeige liefe endlos.
    const inSchleife = (id) => {
      const gesehen = new Set();
      let cur = id;
      while (cur) {
        if (gesehen.has(cur)) return true;
        gesehen.add(cur);
        cur = elternVon.get(cur) || null;
      }
      return false;
    };
    teams.forEach((t) => { if (inSchleife(t.id)) elternVon.set(t.id, null); });

    const knoten = teams.map((t) => ({
      id: t.id,
      name: t.name,
      elternId: elternVon.get(t.id) || null,
      leitung: (() => {
        const p = personVon.get(t.created_by);
        return p ? { id: p.id, name: p.full_name || "Unbenannt", avatar_url: p.avatar_url, rolle: p.role_title || "" } : null;
      })(),
      mitglieder: (idsVon.get(t.id) || [])
        .filter((id) => id !== t.created_by)
        .map((id) => {
          const p = personVon.get(id);
          return {
            id,
            name: p?.full_name || "Unbenannt",
            avatar_url: p?.avatar_url || null,
            rolle: p?.role_title || "",
            // Leitet diese Person selbst ein Team, hängt es weiter unten als
            // eigener Knoten — hier nur der Verweis, damit sie nicht doppelt
            // als einfaches Mitglied erscheint.
            fuehrtTeamId: teams.find((x) => x.created_by === id)?.id || null,
          };
        })
        .sort((a, b) => a.name.localeCompare(b.name, "de")),
    }));

    // Personen ohne Team: gehören zur Organisation, tauchen im Organigramm
    // sonst nirgends auf — genau die will man beim Aufräumen finden.
    const imTeam = new Set();
    teams.forEach((t) => { imTeam.add(t.created_by); (idsVon.get(t.id) || []).forEach((id) => imTeam.add(id)); });
    const ohneTeam = (personen || []).filter((p) => !imTeam.has(p.id))
      .map((p) => ({ id: p.id, name: p.full_name || "Unbenannt", avatar_url: p.avatar_url, rolle: p.role_title || "" }))
      .sort((a, b) => a.name.localeCompare(b.name, "de"));

    // Selbst gebaute Struktur (migration_98). Teams hängen über org_unit_id
    // daran; wer keiner Einheit zugeordnet ist, steht gesondert.
    const { data: einheiten } = await admin.from("org_units")
      .select("id, name, parent_id, order_index").eq("organization_id", orgId)
      .order("order_index").order("created_at");

    const struktur = (einheiten || []).map((e) => ({
      id: e.id,
      name: e.name,
      elternId: e.parent_id || null,
      teams: teams.filter((t) => t.org_unit_id === e.id).map((t) => ({
        id: t.id,
        name: t.name,
        anzahl: (idsVon.get(t.id) || []).length,
        leitung: personVon.get(t.created_by)?.full_name || null,
      })),
    }));
    const teamsOhneEinheit = teams.filter((t) => !t.org_unit_id || !(einheiten || []).some((e) => e.id === t.org_unit_id))
      .map((t) => ({ id: t.id, name: t.name, anzahl: (idsVon.get(t.id) || []).length, leitung: personVon.get(t.created_by)?.full_name || null }));

    // --- Personen-Organigramm (migration_100) ------------------------------
    // Wer unter wem hängt, wird von Hand gepflegt. Die Teams, die jemand
    // leitet oder in denen jemand steckt, kommen automatisch dazu — man
    // pflegt also die Hierarchie, nicht die Teamzugehörigkeit.
    const teamsVonPerson = new Map();
    teams.forEach((t) => {
      const beteiligte = new Set([t.created_by, ...(idsVon.get(t.id) || [])]);
      beteiligte.forEach((id) => {
        if (!teamsVonPerson.has(id)) teamsVonPerson.set(id, []);
        teamsVonPerson.get(id).push({ id: t.id, name: t.name, leitet: t.created_by === id, anzahl: (idsVon.get(t.id) || []).length });
      });
    });

    // Führungskräfte aus einer anderen Organisation (Plattform-Admin) müssen
    // mit auftauchen, sonst hinge ihr halbes Team an einer leeren Stelle.
    const chefIds = Array.from(new Set((personen || []).map((p) => p.vorgesetzter_id).filter(Boolean)));
    const fremdeChefs = chefIds.filter((id) => !idsDerOrg.has(id));
    let zusaetzliche = [];
    if (fremdeChefs.length) {
      const { data: extra2 } = await admin.from("profiles")
        .select("id, full_name, avatar_url, role_title, vorgesetzter_id").in("id", fremdeChefs);
      zusaetzliche = extra2 || [];
    }

    const alsKnoten = (p) => ({
      id: p.id,
      name: p.full_name || "Unbenannt",
      avatar_url: p.avatar_url || null,
      rolle: p.role_title || "",
      chefId: p.vorgesetzter_id || null,
      teams: teamsVonPerson.get(p.id) || [],
    });
    const personenBaum = [...(personen || []), ...zusaetzliche].map(alsKnoten)
      .sort((a, b) => a.name.localeCompare(b.name, "de"));

    // Ringschlüsse aus Altdaten abfangen: sonst gäbe es keine Wurzel.
    const chefVon = new Map(personenBaum.map((p) => [p.id, p.chefId]));
    personenBaum.forEach((p) => {
      const gesehen = new Set();
      let lauf = p.id;
      while (lauf) {
        if (gesehen.has(lauf)) { p.chefId = null; break; }
        gesehen.add(lauf);
        lauf = chefVon.get(lauf) || null;
      }
      // Zeigt jemand auf eine Person, die es hier nicht gibt, steht er oben.
      if (p.chefId && !chefVon.has(p.chefId)) p.chefId = null;
    });

    // Zusatz-Zuordnungen (migration_101) — nur zwischen Personen, die hier
    // ohnehin im Bild sind.
    const bekannt = new Set(personenBaum.map((p) => p.id));
    const { data: zusatzRoh } = await admin.from("org_zusatz_chefs").select("person_id, chef_id");
    const zusatz = (zusatzRoh || []).filter((z) => bekannt.has(z.person_id) && bekannt.has(z.chef_id));

    return res.status(200).json({ teams: knoten, ohneTeam, struktur, teamsOhneEinheit, personenBaum, zusatz });
  } catch (e) {
    console.error("Organigramm fehlgeschlagen:", e.message);
    return res.status(500).json({ error: e.message });
  }
}

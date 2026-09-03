import { getAdminSupabase } from "../../lib/supabaseAdmin";
import { baueIcsFeed } from "../../lib/ics";
import { istFuehrungsrolle } from "../../lib/rollen";

// Der abonnierbare Kalender einer Person.
//
// Diese Route ist die einzige der Academy, die OHNE Anmeldung antwortet —
// sie muss es, denn Apple, Google und Outlook rufen sie im Hintergrund ab,
// ohne Sitzung und ohne Cookie. Der Ausweis ist deshalb ein Geheimnis in
// der Adresse (migration_131).
//
// Daraus folgen drei Regeln, die hier nicht weich werden dürfen:
//
//   1. Der Schlüssel identifiziert GENAU EINE Person. Standardmässig kommen
//      nur ihre eigenen Termine heraus. Wer ein Team führt, kann den Umfang
//      bewusst auf "Team" stellen — dann stehen auch die Termine der
//      geführten Personen darin. Diese Entscheidung steht in der Datenbank
//      und nicht in der Adresse: stünde sie dort, hinge jeder einfach
//      "&umfang=team" an. Und die Rolle wird bei JEDEM Abruf neu geprüft,
//      damit ein abgegebener Teamleiterposten den Kalender sofort wieder
//      einschränkt.
//   2. Nur Lesen. Es gibt keinen Weg, über diese Route etwas zu ändern.
//   3. Kein Hinweis darauf, ob ein Schlüssel existiert: ein falscher
//      Schlüssel bekommt dieselbe Antwort wie ein abgelaufener.
export const config = { maxDuration: 20 };

// Wie weit der Kalender reicht. Rückwirkend genug, um Vergangenes im
// Kalender wiederzufinden, nach vorn offen genug für die Planung.
const TAGE_ZURUECK = 60;
const TAGE_VORAUS = 400;

export default async function handler(req, res) {
  const token = typeof req.query.token === "string" ? req.query.token.trim() : "";
  // Form vorab prüfen: sonst geht jede Zeichenkette als Abfrage an die
  // Datenbank, und eine ungültige UUID quittiert Postgres mit einem Fehler.
  if (!/^[0-9a-f-]{36}$/i.test(token)) return res.status(404).send("Nicht gefunden.");

  try {
    const admin = getAdminSupabase();
    const { data: profil } = await admin.from("profiles")
      .select("id, full_name, organization_id, kalender_umfang, role, is_admin, is_platform_admin")
      .eq("kalender_token", token).maybeSingle();
    if (!profil) return res.status(404).send("Nicht gefunden.");

    // Wessen Termine dürfen hinein? Immer die eigenen. Bei Umfang "Team"
    // zusätzlich die der geführten Personen — Führungsrollen ihre
    // Organisation, Teamleitungen die Mitglieder ihrer eigenen Teams.
    //
    // Die Organisation ist hier die HEIMAT-Organisation: ein Abo läuft ohne
    // Sitzung, es gibt keine "gerade aktive" Organisation, und ein Kalender,
    // dessen Inhalt davon abhinge, in welchem Reiter jemand zuletzt war,
    // wäre nicht nachvollziehbar.
    const personen = new Set([profil.id]);
    const namen = new Map();
    if (profil.kalender_umfang === "team") {
      if (istFuehrungsrolle(profil) && profil.organization_id) {
        const { data: alle } = await admin.from("profiles")
          .select("id, full_name").eq("organization_id", profil.organization_id);
        (alle || []).forEach((p) => { personen.add(p.id); namen.set(p.id, p.full_name); });
      } else {
        const { data: meineTeams } = await admin.from("teams").select("id").eq("created_by", profil.id);
        const teamIds = (meineTeams || []).map((t) => t.id);
        if (teamIds.length) {
          const { data: mitglieder } = await admin.from("team_members")
            .select("user_id, profiles:user_id(full_name, organization_id)").in("team_id", teamIds);
          (mitglieder || []).forEach((m) => {
            // Die Mandanten-Grenze hält auch hier: nur Menschen aus der
            // eigenen Organisation.
            if (m.profiles?.organization_id !== profil.organization_id) return;
            personen.add(m.user_id);
            namen.set(m.user_id, m.profiles?.full_name);
          });
        }
      }
    }

    const jetzt = new Date();
    const von = new Date(jetzt.getTime() - TAGE_ZURUECK * 86400000).toISOString();
    const bis = new Date(jetzt.getTime() + TAGE_VORAUS * 86400000).toISOString();

    // Wozu diese Person eingeladen ist — Zusagen und noch offene
    // Einladungen. Abgelehnte gehören nicht in den eigenen Kalender.
    const { data: einladungen } = await admin.from("termin_einladungen")
      .select("ziel_id, quelle, status").eq("person_id", profil.id).neq("status", "abgesagt");
    const eingeladenLeads = (einladungen || []).filter((e) => e.quelle === "lead").map((e) => e.ziel_id);
    const eingeladenEvents = (einladungen || []).filter((e) => e.quelle === "org_event").map((e) => e.ziel_id);

    const [{ data: eigene }, { data: geladene }, { data: eintraege }] = await Promise.all([
      admin.from("leads").select("id, name, company, appointment_at, status, notes, created_by")
        .in("created_by", [...personen]).not("appointment_at", "is", null)
        .gte("appointment_at", von).lte("appointment_at", bis),
      eingeladenLeads.length
        ? admin.from("leads").select("id, name, company, appointment_at, status, notes, created_by").in("id", eingeladenLeads)
        : Promise.resolve({ data: [] }),
      eingeladenEvents.length
        ? admin.from("org_events").select("id, titel, art, von, bis, uhrzeit, beschreibung").in("id", eingeladenEvents)
        : Promise.resolve({ data: [] }),
    ]);

    // Doppelte vermeiden: wer zu seinem eigenen Termin eingeladen ist,
    // bekäme ihn sonst zweimal im Kalender.
    const leads = new Map();
    [...(eigene || []), ...(geladene || [])].forEach((l) => leads.set(l.id, l));

    const termine = [];
    leads.forEach((l) => {
      termine.push({
        // Stabil über die Termin-Kennung: nur so erkennt der fremde Kalender
        // einen verschobenen Termin als denselben, statt ihn erneut anzulegen.
        uid: `lead-${l.id}@hb-sales-academy.de`,
        // Bei fremden Terminen gehört der Name der Person dazu — sonst
        // stehen im Kalender zwanzig Termine, und man weiss bei keinem, wer
        // ihn wahrnimmt.
        titel: `Termin: ${l.name}${l.company ? ` (${l.company})` : ""}`
          + (l.created_by !== profil.id && namen.get(l.created_by) ? ` — ${namen.get(l.created_by)}` : ""),
        start: l.appointment_at,
        beschreibung: l.notes || null,
        abgesagt: l.status === "abgesagt",
      });
    });

    (eintraege || []).forEach((e) => {
      termine.push({
        uid: `event-${e.id}@hb-sales-academy.de`,
        titel: e.titel,
        // Kalendereinträge haben eine Uhrzeit als Text oder gar keine —
        // ohne Uhrzeit gehört der Eintrag über den ganzen Tag.
        ...(/^\d{1,2}:\d{2}$/.test(String(e.uhrzeit || ""))
          ? { start: `${e.von}T${String(e.uhrzeit).padStart(5, "0")}:00`, dauerMinuten: 60 }
          : { tagVon: e.von, tagBis: e.bis || e.von }),
        beschreibung: e.beschreibung || null,
      });
    });

    const inhalt = baueIcsFeed(termine, { name: `HB Sales Academy — ${profil.full_name || "Meine Termine"}` });

    res.setHeader("Content-Type", "text/calendar; charset=utf-8");
    // Nicht zwischenspeichern: ein verschobener Termin muss beim nächsten
    // Abruf drinstehen und nicht erst, wenn irgendein Zwischenspeicher
    // abläuft. Und nicht indexieren lassen — der Link ist ein Geheimnis.
    res.setHeader("Cache-Control", "no-store, max-age=0");
    res.setHeader("X-Robots-Tag", "noindex, nofollow");
    return res.status(200).send(inhalt);
  } catch (e) {
    console.error("Kalender-Abo fehlgeschlagen:", e.message);
    return res.status(500).send("Kalender konnte nicht erzeugt werden.");
  }
}

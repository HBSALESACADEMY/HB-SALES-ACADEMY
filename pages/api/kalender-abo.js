import { getAdminSupabase } from "../../lib/supabaseAdmin";
import { baueIcsFeed } from "../../lib/ics";

// Der abonnierbare Kalender einer Person.
//
// Diese Route ist die einzige der Academy, die OHNE Anmeldung antwortet —
// sie muss es, denn Apple, Google und Outlook rufen sie im Hintergrund ab,
// ohne Sitzung und ohne Cookie. Der Ausweis ist deshalb ein Geheimnis in
// der Adresse (migration_131).
//
// Daraus folgen drei Regeln, die hier nicht weich werden dürfen:
//
//   1. Der Schlüssel identifiziert GENAU EINE Person. Ausgeliefert wird nur,
//      was diese Person selbst angelegt hat oder wozu sie eingeladen ist —
//      niemals das, was sie als Führungskraft sehen dürfte. Ein Link, der
//      unbemerkt die halbe Organisation preisgibt, wäre eine Katastrophe
//      genau deshalb, weil er so bequem ist.
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
      .select("id, full_name, organization_id").eq("kalender_token", token).maybeSingle();
    if (!profil) return res.status(404).send("Nicht gefunden.");

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
      admin.from("leads").select("id, name, company, appointment_at, status, notes")
        .eq("created_by", profil.id).not("appointment_at", "is", null)
        .gte("appointment_at", von).lte("appointment_at", bis),
      eingeladenLeads.length
        ? admin.from("leads").select("id, name, company, appointment_at, status, notes").in("id", eingeladenLeads)
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
        titel: `Termin: ${l.name}${l.company ? ` (${l.company})` : ""}`,
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

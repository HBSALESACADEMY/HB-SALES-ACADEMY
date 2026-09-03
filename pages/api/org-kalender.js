import { requireUser } from "../../lib/supabaseServer";
import { getAdminSupabase } from "../../lib/supabaseAdmin";
import { istFaellig, aktualisiereKalender } from "../../lib/externerKalenderAbruf";
import { aktiveOrgId } from "../../lib/aktiveOrgServer";
import { tagesBeginnZeitpunkt, tagPlus } from "../../lib/woche";
import { offeneEinladungenFuer } from "../../lib/einladungenServer";

// Alles, was im Firmenkalender eines Zeitraums steht: eingetragene Termine,
// Vertriebstermine, Geburtstage, Abwesenheiten und Einladungen.
//
// Über eine Route, weil fünf Quellen zusammenkommen und die Geburtstage aus
// profiles gelesen werden müssen — dort steht mehr, als im Kalender zu
// sehen sein soll. Herausgegeben wird nur Name, Bild und der Tag.
//
// Zeitraum statt Monat, weil die Wochenansicht über den Monatswechsel
// hinausreicht und das Monatsraster Tage der Nachbarmonate mitzeigt.
export const config = { maxDuration: 20 };

const TAG = /^\d{4}-\d{2}-\d{2}$/;

export default async function handler(req, res) {
  const auth = await requireUser(req, res);
  if (!auth) return;

  const von = String(req.query.von || "");
  const bis = String(req.query.bis || "");
  if (!TAG.test(von) || !TAG.test(bis) || bis < von) {
    return res.status(400).json({ error: "Zeitraum als von/bis im Format JJJJ-MM-TT erforderlich." });
  }

  try {
    const admin = getAdminSupabase();
    const { data: ich } = await auth.client.from("profiles")
      .select("organization_id, is_platform_admin, role, is_admin").eq("id", auth.user.id).maybeSingle();
    const orgId = await aktiveOrgId(admin, ich, auth.user.id);
    if (!orgId) return res.status(400).json({ error: "Keine Organisation gefunden." });

    // Vertriebstermine über den RLS-gebundenen Client: wer einen Termin
    // nicht sehen darf, sieht ihn auch hier nicht. Die Grenzen sind deutsche
    // Tagesgrenzen — der Server läuft in UTC (siehe lib/woche.js).
    const vonZeitpunkt = tagesBeginnZeitpunkt(von);
    const bisZeitpunkt = tagesBeginnZeitpunkt(tagPlus(bis, 1));

    const [{ data: eintraege }, { data: personen }, { data: termine }] = await Promise.all([
      // Überlappend statt nur beginnend: ein mehrtägiger Eintrag, der vorher
      // startet, gehört trotzdem in diesen Zeitraum.
      admin.from("org_events").select("*").eq("organization_id", orgId)
        .lte("von", bis)
        .or(`bis.is.null,bis.gte.${von}`)
        .order("von"),
      admin.from("profiles").select("id, full_name, avatar_url, geburtstag, abwesend_von, abwesend_bis")
        .eq("organization_id", orgId),
      auth.client.from("leads").select("id, name, company, appointment_at, status, outcome, created_by")
        .not("appointment_at", "is", null)
        .gte("appointment_at", vonZeitpunkt)
        .lt("appointment_at", bisZeitpunkt)
        .order("appointment_at"),
    ]);

    // Ein Eintrag, der vorher begann und kein Ende hat, dauert einen Tag
    // — der gehört dann doch nicht hierher.
    const gefiltert = (eintraege || []).filter((e) => (e.bis || e.von) >= von);

    // Welche Termine jemand sieht, entscheidet die Datenbank: angelegt,
    // eingeladen, zugewiesen, erwähnt — oder Führung bzw. Teamleitung
    // (migration_113). Deshalb kommen sie über den RLS-gebundenen Client
    // und nicht über den Admin-Zugang.
    const sichtbareTermine = termine || [];

    // Geburtstage: der Zeitraum kann mehrere Monate berühren, deshalb wird
    // für jeden Monat darin geprüft, ob der Tag hineinfällt.
    const monateImZeitraum = [];
    for (let m = von.slice(0, 7); m <= bis.slice(0, 7); m = naechsterMonat(m)) monateImZeitraum.push(m);
    const geburtstage = [];
    (personen || []).filter((p) => p.geburtstag).forEach((p) => {
      monateImZeitraum.forEach((monat) => {
        if (p.geburtstag.slice(5, 7) !== monat.slice(5, 7)) return;
        // Nur Tag und Monat herausgeben — das Geburtsjahr geht niemanden an.
        const tag = `${monat}-${p.geburtstag.slice(8, 10)}`;
        if (tag < von || tag > bis) return;
        geburtstage.push({ id: p.id, name: p.full_name || "Unbenannt", avatar_url: p.avatar_url, tag });
      });
    });

    const abwesenheiten = (personen || [])
      .filter((p) => (p.abwesend_von || p.abwesend_bis))
      .map((p) => ({
        id: p.id,
        name: p.full_name || "Unbenannt",
        von: p.abwesend_von || p.abwesend_bis,
        bis: p.abwesend_bis || p.abwesend_von,
      }))
      .filter((a) => a.von <= bis && a.bis >= von);

    // Einladungen zu allem, was diese Person hier sehen darf — inklusive
    // Namen, damit "wer hat zugesagt" ohne zweite Abfrage dasteht.
    const zielIds = [...gefiltert.map((e) => e.id), ...sichtbareTermine.map((t) => t.id)];
    let einladungen = [];
    if (zielIds.length) {
      const { data: alle } = await admin.from("termin_einladungen")
        .select("*").eq("organization_id", orgId).in("ziel_id", zielIds);
      einladungen = alle || [];
    }

    // Offene Einladungen unabhängig vom Zeitraum: eine Einladung für den
    // nächsten Monat darf nicht erst dann auftauchen, wenn man dorthin
    // blättert. Dieselbe Auflösung wie auf dem Dashboard.
    const offeneEinladungen = await offeneEinladungenFuer(admin, auth.user.id, orgId);

    // Externe Kalender (migration_134): erst die eigenen fälligen
    // auffrischen, dann die sichtbaren Termine holen. Der Abruf hängt am
    // Seitenaufruf und nicht an einem Zeitplan — so bleibt es ohne
    // zusätzliche Infrastruktur aktuell, und ein Kalender, den niemand
    // ansieht, wird auch nicht abgerufen.
    const externeTermine = await ladeExterneTermine(admin, auth.client, auth.user.id, { vonZeitpunkt, bisZeitpunkt });

    const personenListe = (personen || []).map((p) => ({ id: p.id, name: p.full_name || "Unbenannt", avatar_url: p.avatar_url }));
    const namen = new Map(personenListe.map((p) => [p.id, p.name]));
    return res.status(200).json({
      eintraege: gefiltert.map((e) => ({ ...e, autor: namen.get(e.created_by) || "Unbenannt" })),
      termine: sichtbareTermine.map((t) => ({ ...t, autor: namen.get(t.created_by) || "Unbenannt" })),
      einladungen: einladungen.map((e) => ({
        ...e,
        name: namen.get(e.person_id) || "Unbenannt",
        von_name: namen.get(e.eingeladen_von) || "Unbenannt",
      })),
      geburtstage,
      abwesenheiten,
      externeTermine,
      // Für die Auswahlliste beim Einladen — nur die eigene Organisation.
      personen: personenListe,
      offeneEinladungen,
      selbst: auth.user.id,
    });
  } catch (e) {
    console.error("Kalender konnte nicht geladen werden:", e.message);
    return res.status(500).json({ error: e.message });
  }
}

function naechsterMonat(monat) {
  const [j, m] = monat.split("-").map(Number);
  return m === 12 ? `${j + 1}-01` : `${j}-${String(m + 1).padStart(2, "0")}`;
}


/**
 * Externe Kalender-Termine, die diese Person sehen darf.
 *
 * Zwei Schritte, die nicht vertauscht werden dürfen:
 *
 *   1. WER — das entscheidet die Datenbank über den RLS-gebundenen Client.
 *      Eigene Termine immer, fremde nur bei Führung oder Teamleitung.
 *   2. WAS — das entscheidet der Server hier. Steht die Quelle auf
 *      "belegt", wird der Titel gar nicht erst mitgeschickt. Eine
 *      Zugriffsregel kann keine einzelne Spalte ausblenden, also muss es an
 *      dieser Stelle passieren — und bevor die Daten den Server verlassen,
 *      nicht erst in der Anzeige.
 */
async function ladeExterneTermine(admin, client, userId, { vonZeitpunkt, bisZeitpunkt }) {
  try {
    // Nur die EIGENEN fälligen Kalender abrufen: fremde aufzufrischen wäre
    // eine Aufgabe, die sich von aussen beliebig oft anstossen liesse.
    const { data: eigene } = await admin.from("externe_kalender")
      .select("id, user_id, url, letzter_abruf").eq("user_id", userId).eq("aktiv", true);
    const faellige = (eigene || []).filter((k) => istFaellig(k.letzter_abruf));
    if (faellige.length) await Promise.all(faellige.map((k) => aktualisiereKalender(admin, k)));

    const { data: termine } = await client.from("externe_termine")
      .select("id, user_id, kalender_id, titel, beginn, ende, ganztags")
      .lt("beginn", bisZeitpunkt).gt("ende", vonZeitpunkt)
      .order("beginn").limit(2000);
    if (!termine?.length) return [];

    const quellIds = [...new Set(termine.map((t) => t.kalender_id))];
    const { data: quellen } = await admin.from("externe_kalender")
      .select("id, sichtbarkeit, name").in("id", quellIds);
    const sicht = new Map((quellen || []).map((q) => [q.id, q]));

    return termine.map((t) => {
      const quelle = sicht.get(t.kalender_id);
      const eigener = t.user_id === userId;
      // Den eigenen Titel sieht man immer: die Einstellung schützt vor den
      // anderen, nicht vor einem selbst.
      const mitTitel = eigener || quelle?.sichtbarkeit === "titel";
      return {
        id: t.id,
        user_id: t.user_id,
        titel: mitTitel ? (t.titel || "Termin") : "Belegt",
        beginn: t.beginn,
        ende: t.ende,
        ganztags: t.ganztags,
        eigener,
        quelle: eigener ? quelle?.name || null : null,
      };
    });
  } catch (e) {
    // Ein fremder Kalender darf den eigenen nie aufhalten.
    console.error("Externe Kalender laden:", e.message);
    return [];
  }
}

// Termine nach Tagen bündeln.
//
// Eine Liste aus dreissig gleich aussehenden Karten beantwortet die Frage
// nicht, die man an eine Terminliste stellt: was ist heute, was morgen.
// Man liest dann jedes Datum einzeln — und genau deshalb liest man die
// Liste irgendwann gar nicht mehr.
//
// Gruppiert wird nach DEUTSCHEM Tag, nicht nach dem des Geräts: ein Termin
// um 00:30 liegt in UTC noch am Vortag, und auf einem Rechner, der anders
// eingestellt ist, rutschte er in die falsche Gruppe.

import { deutscherTag } from "./terminzeit.js";
import { berlinHeute, tagPlus } from "./woche.js";

const WOCHENTAGE = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
const MONATE = ["Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember"];

/**
 * Wie ein Tag heisst: "Heute", "Morgen", "Gestern" — sonst Wochentag und
 * Datum. Die drei Wörter sind der ganze Gewinn: sie beantworten die Frage
 * ohne Rechnen.
 */
export function tagesTitel(tagStr, jetzt = new Date()) {
  if (!tagStr) return "Ohne Zeitpunkt";
  const heute = berlinHeute(jetzt);
  if (tagStr === heute) return "Heute";
  if (tagStr === tagPlus(heute, 1)) return "Morgen";
  if (tagStr === tagPlus(heute, -1)) return "Gestern";

  const d = new Date(`${tagStr}T12:00:00Z`);
  return `${WOCHENTAGE[d.getUTCDay()]}, ${d.getUTCDate()}. ${MONATE[d.getUTCMonth()]}`;
}

/** Der Zusatz hinter "Heute" — sonst weiss man das Datum nicht. */
export function tagesDatum(tagStr) {
  if (!tagStr) return "";
  const d = new Date(`${tagStr}T12:00:00Z`);
  return `${WOCHENTAGE[d.getUTCDay()]}, ${d.getUTCDate()}. ${MONATE[d.getUTCMonth()]}`;
}

/**
 * Termine nach Tagen bündeln, in der Reihenfolge, in der sie ankommen.
 *
 * Die Sortierung der Liste bleibt erhalten: bevorstehende aufsteigend,
 * vergangene absteigend. Hier wird nur gebündelt, nicht umsortiert — sonst
 * stünde in der Vergangenheitsansicht plötzlich das Älteste oben.
 *
 * Termine ohne Zeitpunkt kommen ans Ende. Sie gehören nicht an den Anfang:
 * dort stünde eine Gruppe, die nie dringend ist, über dem, was heute ist.
 */
export function gruppiereNachTag(leads = [], jetzt = new Date()) {
  const gruppen = [];
  const nachSchluessel = new Map();

  leads.forEach((l) => {
    const tag = l?.appointment_at ? deutscherTag(l.appointment_at) : null;
    const schluessel = tag || "ohne";
    if (!nachSchluessel.has(schluessel)) {
      const gruppe = {
        schluessel,
        tag,
        titel: tagesTitel(tag, jetzt),
        datum: tag ? tagesDatum(tag) : "",
        istHeute: !!tag && tag === berlinHeute(jetzt),
        leads: [],
      };
      nachSchluessel.set(schluessel, gruppe);
      gruppen.push(gruppe);
    }
    nachSchluessel.get(schluessel).leads.push(l);
  });

  // Ohne Zeitpunkt ans Ende, egal wo sie in der Liste standen.
  return [...gruppen.filter((g) => g.tag), ...gruppen.filter((g) => !g.tag)];
}

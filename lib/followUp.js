// Wer nach dem Termin noch etwas braucht.
//
// Ein Termin ist mit dem Termin nicht zu Ende. Wahrgenommen ohne Ergebnis
// heisst: jemand muss nachfassen. Abgesagt heisst: der Kontakt ist nicht
// verloren, nur der Zeitpunkt. Beides verschwindet heute in der langen
// Terminliste zwischen den bevorstehenden Terminen — und damit aus dem Kopf.

// Was zu tun ist, in der Reihenfolge, in der es drängt.
import { checkinFaellig, artVon, CHECKIN_NACH_TAGEN } from "./terminArt.js";

export const FOLLOW_KATEGORIEN = [
  {
    key: "checkin",
    label: "Check-in fällig",
    hinweis: `Kunde seit über ${CHECKIN_NACH_TAGEN} Tagen — der Anruf, mit dem aus 90 % die vollen 100 werden`,
  },
  {
    key: "offen",
    label: "Ergebnis fehlt",
    hinweis: "Termin war, aber niemand hat festgehalten, was dabei herauskam",
  },
  {
    key: "ueberlegt",
    label: "Überlegt es sich",
    hinweis: "Der Kunde wollte nachdenken — hier entscheidet sich, ob nachgefasst wird",
  },
  {
    key: "abgesagt",
    label: "Abgesagt",
    hinweis: "Nicht der Kontakt ist weg, nur der Zeitpunkt",
  },
  {
    key: "nicht_gekauft",
    label: "Closing ohne Abschluss",
    hinweis: "Der Closing Call war, ein Kunde wurde es nicht — das ist kein verlorener Kontakt, sondern einer für später",
  },
];

/** In welche Kategorie ein Termin gehört — null, wenn er nichts braucht. */
export function kategorieVon(lead) {
  if (!lead) return null;
  // Ein persönlicher Termin braucht kein Nachfassen und kein Ergebnis.
  if (lead.kein_kundentermin) return null;
  // Zuerst: Der Check-in nach dem Abschluss. Er steht vor allem anderen,
  // weil er die einzige Stufe nach dem Verkauf ist — und deshalb die, die
  // ohne festen Platz immer vergessen wird.
  if (checkinFaellig(lead)) return "checkin";
  if (lead.status === "abgesagt") return "abgesagt";
  if (lead.status !== "wahrgenommen") return null;      // geplant: noch nichts zu tun
  if (!lead.outcome) return "offen";
  if (lead.outcome === "follow_up") return "ueberlegt";
  // Nach dem Closing Call ohne Abschluss: nicht verloren, nur nicht jetzt.
  // Wer diese Kontakte aus der Liste fallen lässt, hat den ganzen Aufwand
  // bis zum Abschlussgespräch betrieben und wirft das Ergebnis weg.
  if (lead.outcome === "absage" && artVon(lead).key === "closing") return "nicht_gekauft";
  return null;                                          // Kunde oder frühe Absage
}

export function brauchtFollowUp(lead) {
  return kategorieVon(lead) !== null;
}

/**
 * Wie lange etwas schon liegt — nach dem Termin, nicht nach der Anlage.
 * Ein Termin von gestern drängt anders als einer von vor drei Wochen.
 */
export function liegtSeit(lead, jetzt = new Date()) {
  const bezug = lead?.appointment_at || lead?.created_at;
  if (!bezug) return null;
  const tage = Math.floor((jetzt.getTime() - new Date(bezug).getTime()) / 86400000);
  return Number.isFinite(tage) ? Math.max(0, tage) : null;
}

/** Das Älteste zuerst: was am längsten liegt, wird am ehesten vergessen. */
export function sortiereNachDringlichkeit(leads = [], jetzt = new Date()) {
  return [...leads].sort((a, b) => (liegtSeit(b, jetzt) ?? 0) - (liegtSeit(a, jetzt) ?? 0));
}

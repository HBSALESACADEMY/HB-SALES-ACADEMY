// Wer nach dem Termin noch etwas braucht.
//
// Ein Termin ist mit dem Termin nicht zu Ende. Wahrgenommen ohne Ergebnis
// heisst: jemand muss nachfassen. Abgesagt heisst: der Kontakt ist nicht
// verloren, nur der Zeitpunkt. Beides verschwindet heute in der langen
// Terminliste zwischen den bevorstehenden Terminen — und damit aus dem Kopf.

// Was zu tun ist, in der Reihenfolge, in der es drängt.
export const FOLLOW_KATEGORIEN = [
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
];

/** In welche Kategorie ein Termin gehört — null, wenn er nichts braucht. */
export function kategorieVon(lead) {
  if (!lead) return null;
  if (lead.status === "abgesagt") return "abgesagt";
  if (lead.status !== "wahrgenommen") return null;      // geplant: noch nichts zu tun
  if (!lead.outcome) return "offen";
  if (lead.outcome === "follow_up") return "ueberlegt";
  return null;                                          // Kunde oder endgültige Absage
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

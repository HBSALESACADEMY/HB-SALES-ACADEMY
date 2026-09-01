// Quoten rund um das Terminieren.
//
// Eine eigene Datei, weil dieselben Zahlen an drei Stellen auftauchen: in der
// Quoten-Karte, als Spalten in der Tabelle pro Person und im Excel-Export.
// Dreimal dieselbe Rechnung hingeschrieben heisst: irgendwann rechnet eine
// Stelle anders als die andere, und niemand merkt es.
//
// Eine Regel zieht sich durch: gibt es keine Grundlage, kommt `null` zurück
// und nicht 0. "0 % Termine je Gespräch" wäre eine Aussage über etwas, das
// gar nicht stattgefunden hat — angezeigt wird dann ein Strich.

function anteil(teil, ganzes) {
  if (!ganzes) return null;
  return Math.round((teil / ganzes) * 100);
}

/**
 * Rechnet aus den Tageszählern die Quoten aus.
 * @param {object} z Zähler wie in call_log_days.counts
 */
export function berechneQuoten(z = {}) {
  const anwahlen = z.anwahlen || 0;
  const erreicht = z.erreicht || 0;
  const gatekeeper = z.gatekeeper || 0;
  const entscheider = z.entscheider || 0;
  const weitergeleitet = z.weitergeleitet || 0;
  const termin = z.termin || 0;

  // Wie oft jemand bei der Entscheidung gelandet ist — direkt erreicht oder
  // durchgestellt. Abgeleitet, nicht zusätzlich gebucht (siehe callTracker.js).
  const beiEntscheidung = entscheider + weitergeleitet;

  return {
    beiEntscheidung,
    // Wie viele Anwahlen kostet ein Termin? Die Zahl, die ein Vertriebler
    // morgens braucht: "ich will zwei Termine, also brauche ich ~120 Anrufe".
    anwahlenProTermin: termin > 0 ? anwahlen / termin : null,
    erreichbarkeit: anteil(erreicht, anwahlen),
    terminJeAnwahl: anteil(termin, anwahlen),
    terminJeGespraech: anteil(termin, erreicht),
    terminJeEntscheider: anteil(termin, beiEntscheidung),
    durchstellQuote: anteil(weitergeleitet, gatekeeper),
  };
}

/** Prozentwert für die Anzeige. `null` wird zum Strich, nicht zu "0 %". */
export function prozentText(wert) {
  return wert === null || wert === undefined ? "—" : `${wert} %`;
}

/**
 * Anwahlen pro Termin: eine Nachkommastelle, deutsches Komma.
 * Ganze Zahlen bleiben ganz — "60,0 Anwahlen" liest sich niemand gern.
 */
export function zahlText(wert) {
  if (wert === null || wert === undefined) return "—";
  const gerundet = Math.round(wert * 10) / 10;
  return Number.isInteger(gerundet) ? String(gerundet) : gerundet.toFixed(1).replace(".", ",");
}

// Reihenfolge und Beschriftung an einer Stelle: Karte, Tabelle und Export
// zeigen dieselben Quoten in derselben Reihenfolge.
export const QUOTEN_SPALTEN = [
  { key: "anwahlenProTermin",  label: "Anwahlen je Termin",     art: "zahl",    hinweis: "Wie viele Anrufe ein Termin kostet" },
  { key: "erreichbarkeit",     label: "Erreichbarkeit",         art: "prozent", hinweis: "Gespräche je Anwahl" },
  { key: "terminJeAnwahl",     label: "Termine je Anwahl",      art: "prozent", hinweis: "Termine gemessen an allen Anrufen" },
  { key: "terminJeGespraech",  label: "Termine je Gespräch",    art: "prozent", hinweis: "Termine gemessen an den erreichten Gesprächen" },
  { key: "terminJeEntscheider", label: "Termine beim Entscheider", art: "prozent", hinweis: "Termine gemessen an den Gesprächen mit der Entscheidung" },
  { key: "durchstellQuote",    label: "Durchstell-Quote",       art: "prozent", hinweis: "Wie oft das Vorzimmer weiterverbindet" },
];

/** Wert einer Quotenspalte als fertiger Text. */
export function quotenText(quoten, spalte) {
  const wert = quoten[spalte.key];
  return spalte.art === "zahl" ? zahlText(wert) : prozentText(wert);
}

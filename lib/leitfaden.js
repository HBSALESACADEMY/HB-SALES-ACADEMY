// Der Gesprächsablauf, der erscheint, sobald der Entscheider am Telefon ist.
//
// Nicht als Schulungsmaterial gedacht, sondern als Gedächtnisstütze in genau
// dem Moment, in dem sie zählt: Der Kunde ist dran, das Herz schlägt, und
// die Reihenfolge ist das Erste, was verlorengeht.
//
// Deshalb bewusst kurz. Wer im Gespräch einen Absatz lesen muss, liest ihn
// nicht — er redet einfach los.

export const STANDARD_LEITFADEN = [
  { titel: "Pitch", hinweis: "Kurz, klar, auf den Punkt" },
  { titel: "Bedarfsanalyse", hinweis: "Fragen stellen, zuhören" },
  { titel: "Terminierung", hinweis: "Konkreten Termin vorschlagen" },
  { titel: "Qualifizierung", hinweis: "Passt der Kunde? Entscheidungsbefugnis?" },
];

/**
 * Der Leitfaden dieser Organisation — oder der Standard.
 *
 * Eine leere Liste heisst ausdrücklich "kein Leitfaden": wer ihn abschaltet,
 * soll nicht den Standard zurückbekommen.
 */
export function resolveLeitfaden(org) {
  const eigen = org?.gespraechsleitfaden;
  if (Array.isArray(eigen)) return eigen.filter((s) => s?.titel?.trim());
  return STANDARD_LEITFADEN;
}

/** Zeigt die Academy den Leitfaden überhaupt an? */
export function hatLeitfaden(org) {
  return resolveLeitfaden(org).length > 0;
}

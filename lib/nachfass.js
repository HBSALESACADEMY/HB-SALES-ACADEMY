// Der Rückruf nach der Mail.
//
// Eine verschickte Mail ist kein Termin — und genau deshalb geht das
// Nachfassen unter: es steht in keinem Kalender, und über zwanzig Kontakte
// hinweg behält es niemand im Kopf. Hier stehen die Regeln dafür an einer
// Stelle, damit Kalender, Erinnerung und Maske nicht auseinanderlaufen.

/** Um diese Uhrzeit wird angerufen, wenn niemand etwas anderes sagt. */
export const NACHFASS_STUNDE = 9;

// Vorschläge statt eines leeren Datumsfeldes: wer nach dem Absenden erst
// rechnen muss, trägt nichts ein.
export const NACHFASS_VORSCHLAEGE = [
  { tage: 3, label: "in 3 Tagen" },
  { tage: 7, label: "in 1 Woche" },
  { tage: 14, label: "in 2 Wochen" },
];

/**
 * Ein Zeitpunkt in so vielen Tagen, morgens.
 *
 * Bewusst mit Uhrzeit: der Eintrag geht in einen Kalender, und ein
 * Kalendereintrag ohne Uhrzeit hängt als Ganztagesbalken über allem.
 */
export function faelligIn(tage, jetzt = new Date()) {
  const d = new Date(jetzt.getTime() + tage * 86400000);
  d.setHours(NACHFASS_STUNDE, 0, 0, 0);
  return d;
}

/** Was im Kalender steht. Ohne Kontaktnamen wäre der Eintrag wertlos. */
export function nachfassTitel(kontakt) {
  const name = kontakt?.name?.trim();
  const firma = kontakt?.firma?.trim();
  if (!name && !firma) return "Nachfassen";
  return `Nachfassen: ${name || firma}${name && firma ? ` (${firma})` : ""}`;
}

/**
 * Ist dieses Nachfassen fällig?
 *
 * Fällig heisst: der Zeitpunkt ist erreicht und niemand hat es abgehakt.
 * Ein erledigtes Nachfassen ist nie fällig, auch wenn sein Termin in der
 * Vergangenheit liegt — sonst stünde die Liste voller alter Häkchen.
 */
export function istFaelligesNachfassen(n, jetzt = new Date()) {
  if (!n || n.erledigt_am) return false;
  return new Date(n.faellig_am).getTime() <= jetzt.getTime();
}

/**
 * Die offenen Nachfass-Termine bis einschliesslich heute, das Älteste
 * zuerst — was am längsten liegt, drängt am meisten.
 */
export function offeneNachfass(liste = [], jetzt = new Date()) {
  return liste
    .filter((n) => istFaelligesNachfassen(n, jetzt))
    .sort((a, b) => String(a.faellig_am).localeCompare(String(b.faellig_am)));
}

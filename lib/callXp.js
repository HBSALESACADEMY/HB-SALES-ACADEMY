// XP für die Arbeit im Call Tracker.
//
// Die eine Gefahr, um die hier alles gebaut ist: Der Call Tracker ist ein
// Zähler mit einem Knopf. Wer XP fürs Klicken bekommt, klickt — und zwar
// statt zu telefonieren. Eine Rangliste, die sich erklicken lässt, ist nicht
// nur wertlos, sie belohnt genau das falsche Verhalten und macht die Zahlen
// aller anderen mit kaputt.
//
// Deshalb drei Regeln:
//
//   1. XP gibt es für ERGEBNISSE, nicht für Anwahlen. Ein Termin ist ein
//      Ergebnis, ein erreichtes Gespräch auch — eine Anwahl ist nur ein
//      Knopfdruck.
//   2. Das blosse Führen des Trackers ist trotzdem etwas wert, aber als
//      einmaliger Tagesbonus ab einer ernsthaften Menge. Nicht je Klick.
//   3. Eine Tagesobergrenze. Auch der beste Tag am Telefon soll das
//      Lernen in der Academy nicht bedeutungslos machen.

export const CALL_XP = {
  termin: 20,        // das Ziel der ganzen Tätigkeit
  erreicht: 3,       // ein echtes Gespräch, unabhängig vom Ausgang
  negativMitGrund: 1, // belohnt sauberes Erfassen, nicht das Scheitern
  tagesbonus: 10,    // einmal je Tag, ab ernsthafter Nutzung
  bonusAb: 20,       // so viele Anwahlen gelten als ernsthafte Nutzung
  tagesLimit: 150,   // Obergrenze je Tag aus dem Call Tracker
};

/**
 * Wie viel XP jemandem für einen Tag aus dem Call Tracker zusteht.
 * Gerechnet wird immer der GESAMTE Tag, nicht der Zuwachs — so kommt bei
 * einer Korrektur nach unten nichts Doppeltes heraus.
 */
export function xpFuerTag(counts = {}, reasons = {}) {
  const anwahlen = counts.anwahlen || 0;
  const erreicht = counts.erreicht || 0;
  const termin = counts.termin || 0;
  // Nur negative Anrufe, zu denen auch ein Grund erfasst wurde: für das
  // blosse Wegklicken gibt es nichts.
  const mitGrund = Math.min(counts.negativ || 0, Object.values(reasons).reduce((s, v) => s + (Number(v) || 0), 0));

  const roh =
    termin * CALL_XP.termin +
    erreicht * CALL_XP.erreicht +
    mitGrund * CALL_XP.negativMitGrund +
    (anwahlen >= CALL_XP.bonusAb ? CALL_XP.tagesbonus : 0);

  return Math.min(CALL_XP.tagesLimit, roh);
}

/**
 * Was jetzt noch nachzuzahlen ist.
 *
 * Nie negativ: wer eine Zahl nach unten korrigiert, soll nicht plötzlich XP
 * verlieren, das er für echte Arbeit bekommen hat. Der Tag bleibt dann
 * einfach stehen, bis er die Grenze wieder überschreitet.
 */
export function offeneXp(counts, reasons, bereitsVergeben = 0) {
  return Math.max(0, xpFuerTag(counts, reasons) - (Number(bereitsVergeben) || 0));
}

// Wie viel Zeit ein Lauf noch hat.
//
// Am 25.09.2026 starb der Morgenlauf um 9:49 nach 60 Sekunden mit einem
// 504 — Vercel schneidet eine Funktion hart ab, mitten im Satz. Am Tag
// davor war dieselbe Nachricht um 9:49 noch durchgekommen. Der Lauf lag
// also längst am Limit, und niemand konnte es sehen: Ein Timeout hinterlässt
// keine Liste dessen, was noch offen war.
//
// Zwei Dinge löst diese Datei:
//
//   1. Der Lauf hört von selbst auf, bevor Vercel ihn abschneidet. Ein
//      geordneter Abbruch kann sagen, was fehlt; ein 504 kann das nicht.
//   2. Die Reihenfolge bekommt damit Gewicht. Was zuerst läuft, kommt raus,
//      auch wenn es knapp wird — deshalb stehen die Nachrichten an Menschen
//      vor der Wartungsarbeit.

/** Vercel tötet bei 60 Sekunden (Hobby-Tarif). Fünf bleiben für die Antwort. */
export const GRENZE_MS = 55000;

/**
 * Ein Budget, das mitzählt.
 *
 * @param grenzeMs  Wie lange der Lauf insgesamt dauern darf
 * @param jetzt     Zeitgeber — im Test eine Funktion, die springt
 */
export function neuesBudget(grenzeMs = GRENZE_MS, jetzt = () => Date.now()) {
  const start = jetzt();
  return {
    /** Verbrauchte Millisekunden. */
    verbraucht: () => jetzt() - start,
    /** Restliche Millisekunden, nie negativ. */
    rest: () => Math.max(0, grenzeMs - (jetzt() - start)),
    /**
     * Reicht die Zeit noch für einen Schritt, der etwa "brauchtMs" dauert?
     *
     * Die Schätzung darf grob sein: Sie verhindert, dass ein Schritt
     * ANGEFANGEN wird, für den offensichtlich keine Zeit mehr ist. Ein
     * Schritt, der mitten im Versand abgeschnitten wird, hinterlässt
     * halb verschickte Nachrichten.
     */
    hatZeit: (brauchtMs = 3000) => grenzeMs - (jetzt() - start) >= brauchtMs,
  };
}

/**
 * Schritte der Reihe nach ausführen, solange die Zeit reicht.
 *
 * Jeder Schritt läuft in seinem eigenen try: Ein Fehler in der
 * Nachfass-Erinnerung darf den Wochenimpuls nicht aufhalten. Und jeder
 * Schritt nennt, was er ungefähr braucht — reicht es nicht mehr, wird er
 * übersprungen und steht in "offen".
 *
 * @param schritte  [{ name, braucht, lauf: async () => ergebnis }]
 * @returns { ergebnisse, offen, fehler, dauerMs }
 */
export async function laufeSchritte(schritte = [], budget = neuesBudget()) {
  const ergebnisse = {};
  const offen = [];
  const fehler = {};
  for (const schritt of schritte) {
    if (!schritt?.name || typeof schritt.lauf !== "function") continue;
    if (schritt.wenn && !schritt.wenn()) continue;
    if (!budget.hatZeit(schritt.braucht || 3000)) { offen.push(schritt.name); continue; }
    try {
      ergebnisse[schritt.name] = await schritt.lauf();
    } catch (e) {
      fehler[schritt.name] = e?.message || String(e);
      // Auf die Konsole, damit es in den Vercel-Protokollen steht — die
      // Antwort liest niemand, wenn der Cron sie abholt.
      console.error(`Cron-Schritt "${schritt.name}" fehlgeschlagen:`, fehler[schritt.name]);
    }
  }
  return { ergebnisse, offen, fehler, dauerMs: budget.verbraucht() };
}

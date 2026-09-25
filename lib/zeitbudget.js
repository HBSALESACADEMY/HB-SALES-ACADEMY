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
  // Wie lange jeder Schritt gebraucht hat.
  //
  // Ohne diese Zahlen lässt sich nicht sagen, WARUM ein Lauf ins Timeout
  // läuft. Am 25.09.2026 wurde genau darüber geraten: Der Bericht an den
  // Betreiber kam am Vortag um 9:49 und der Lauf starb am nächsten Tag um
  // 9:49 — also musste irgendetwas fast eine Minute dauern. Welcher Schritt
  // es war, wusste niemand.
  const dauern = {};
  for (const schritt of schritte) {
    if (!schritt?.name || typeof schritt.lauf !== "function") continue;
    if (schritt.wenn && !schritt.wenn()) continue;
    if (!budget.hatZeit(schritt.braucht || 3000)) { offen.push(schritt.name); continue; }
    const vorher = budget.verbraucht();
    try {
      ergebnisse[schritt.name] = await schritt.lauf();
    } catch (e) {
      fehler[schritt.name] = e?.message || String(e);
      // Auf die Konsole, damit es in den Vercel-Protokollen steht — die
      // Antwort liest niemand, wenn der Cron sie abholt.
      console.error(`Cron-Schritt "${schritt.name}" fehlgeschlagen:`, fehler[schritt.name]);
    }
    dauern[schritt.name] = budget.verbraucht() - vorher;
  }
  // Eine Zeile in den Vercel-Protokollen, aus der sich der nächste Ausfall
  // erklären lässt.
  const zeiten = Object.entries(dauern).map(([name, ms]) => `${name} ${(ms / 1000).toFixed(1)}s`).join(", ");
  if (zeiten) console.log(`Cron-Zeiten: ${zeiten}${offen.length ? ` | offen: ${offen.join(", ")}` : ""}`);
  return { ergebnisse, offen, fehler, dauern, dauerMs: budget.verbraucht() };
}

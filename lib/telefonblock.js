// Telefonblöcke: das Rechnen, ohne Datenbank (migration_181).
//
// Getrennt von lib/telefonblockSpeicher.js, damit sich prüfen lässt, WAS
// gespeichert wird — die Tests laufen ohne Browser und ohne Datenbank, und
// eine Datei, die den Datenbank-Client mitzieht, lässt sich dort nicht
// laden. Dieselbe Trennung wie bei der Tagesauswertung und der
// Team-Nachricht.

/**
 * Aus einem beendeten Block die Zeile für die Datenbank.
 *
 * Rein rechnend, ohne Datenbank — damit sich prüfen lässt, was gespeichert
 * wird. "seit" ist der Startzeitpunkt des Blocks, alles andere kommt aus
 * dem Ergebnis (lib/anwahlSpiel.js).
 */
export function blockZeile({ userId, orgId = null, laufend, ergebnis, jetzt = new Date() } = {}) {
  if (!userId || !laufend?.seit || !ergebnis) return null;
  const minuten = Math.max(1, Math.round(Number(ergebnis.minuten) || 1));
  const ziel = Math.max(1, Math.round(Number(laufend.minuten) || minuten));
  return {
    user_id: userId,
    organization_id: orgId || null,
    gestartet_at: new Date(laufend.seit).toISOString(),
    beendet_at: jetzt.toISOString(),
    ziel_minuten: ziel,
    minuten,
    anwahlen: Math.max(0, Math.round(Number(ergebnis.anwahlen) || 0)),
    // Ob die vorgenommene Zeit voll wurde. Der Unterschied ist die
    // interessante Information: Wer 25 Minuten wählt und nach 6 aufhört,
    // arbeitet anders als wer auf 40 verlängert.
    ziel_erreicht: minuten >= ziel,
  };
}

/**
 * Was die Blöcke eines Tages zusammen ergeben.
 *
 * "proStunde" wird über die GESAMTE Blockzeit gerechnet, nicht als
 * Mittelwert der einzelnen Werte: Ein Block von zwei Minuten mit drei
 * Anwahlen ergibt 90 pro Stunde und würde einen Mittelwert sonst nach oben
 * ziehen, obwohl in der Stunde nichts passiert ist.
 */
export function blockBilanz(bloecke = []) {
  const liste = Array.isArray(bloecke) ? bloecke : [];
  if (!liste.length) return { anzahl: 0, minuten: 0, anwahlen: 0, proStunde: null, bester: null };
  const minuten = liste.reduce((s, b) => s + (Number(b.minuten) || 0), 0);
  const anwahlen = liste.reduce((s, b) => s + (Number(b.anwahlen) || 0), 0);
  const bester = liste.reduce((b, k) => ((Number(k.anwahlen) || 0) > (Number(b?.anwahlen) || 0) ? k : b), liste[0]);
  return {
    anzahl: liste.length,
    minuten,
    anwahlen,
    proStunde: minuten > 0 ? Math.round((anwahlen / minuten) * 60) : null,
    bester,
  };
}

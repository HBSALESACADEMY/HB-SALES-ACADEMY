// Telefonblöcke: das Rechnen, ohne Datenbank (migration_181).
//
// Getrennt von lib/telefonblockSpeicher.js, damit sich prüfen lässt, WAS
// gespeichert wird — die Tests laufen ohne Browser und ohne Datenbank, und
// eine Datei, die den Datenbank-Client mitzieht, lässt sich dort nicht
// laden. Dieselbe Trennung wie bei der Tagesauswertung und der
// Team-Nachricht.
import { berlinHeute } from "./woche.js";

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

/**
 * Tage und Blöcke zusammenführen — für den Reiter "Vergangene Tage".
 *
 * Die Tagessummen kommen aus call_log_days, die Runden aus
 * telefon_bloecke. Beides gehört in EINE Zeile je Tag: Die Frage ist nicht
 * "wie viele Anwahlen" oder "wie viele Blöcke", sondern wie beides
 * zusammenhängt — achtzig Anwahlen in drei konzentrierten Runden sind ein
 * anderer Tag als achtzig über neun Stunden verteilt.
 *
 * Ein Tag erscheint, wenn es an ihm IRGENDETWAS gab: Zahlen oder Runden.
 * Leere Tage bleiben weg — eine Liste mit zwanzig Nullzeilen verdeckt die
 * drei Tage, um die es geht.
 *
 * Zugeordnet wird nach dem BERLINER Kalendertag des Blockstarts: Ein Block
 * von 23:30 gehört zu diesem Tag, nicht zum nächsten.
 */
export function tageMitBloecken(tage = [], bloecke = [], jetzt = new Date()) {
  const jeTag = new Map();
  const hole = (tag) => {
    if (!jeTag.has(tag)) jeTag.set(tag, { tag, anwahlen: 0, termin: 0, bloecke: [] });
    return jeTag.get(tag);
  };

  (Array.isArray(tage) ? tage : []).forEach((z) => {
    if (!z?.log_date) return;
    const eintrag = hole(z.log_date);
    eintrag.anwahlen = Number(z.counts?.anwahlen) || 0;
    eintrag.termin = Number(z.counts?.termin) || 0;
  });

  (Array.isArray(bloecke) ? bloecke : []).forEach((b) => {
    const start = new Date(b?.gestartet_at);
    if (Number.isNaN(start.getTime())) return;
    hole(berlinHeute(start)).bloecke.push(b);
  });

  const heute = berlinHeute(jetzt);
  return [...jeTag.values()]
    .map((e) => ({
      ...e,
      istHeute: e.tag === heute,
      // Innerhalb des Tages die neueste Runde zuerst — wie im Call Tracker.
      bloecke: e.bloecke.sort((a, b) => String(b.gestartet_at).localeCompare(String(a.gestartet_at))),
      bilanz: blockBilanz(e.bloecke),
    }))
    .filter((e) => e.anwahlen > 0 || e.termin > 0 || e.bloecke.length)
    .sort((a, b) => b.tag.localeCompare(a.tag));
}

// Was passiert, wenn eine Zahl im Call Tracker korrigiert wird.
//
// Der Minus-Knopf hat bisher genau eine Kachel verkleinert. Nimmt man eine
// ANWAHL zurück, bleibt aber alles stehen, was an diesem Anruf hing: das
// Erreicht, das Vorzimmer, das Durchgestellt, der Termin, der negative
// Anruf samt Ablehnungsgrund. Danach widerspricht sich die Tabelle — daher
// kamen 564 gegen 571, der "Überhang" und die Reste, die nirgendwo
// hingehörten.
//
// Zwei Stufen, die zusammenarbeiten:
//
//   1. Der letzte Anruf wird komplett zurückgenommen. Der Tracker merkt
//      sich je Anruf, was dieser Anruf gebucht hat — abgezogen wird also
//      genau das, nicht geraten.
//   2. Danach wird die Tabelle eingeregelt: keine Zahl darf grösser sein
//      als ihre Grundlage. Das greift auch für Zahlen aus der Zeit vor
//      dieser Änderung, für die es keine Anruf-Historie gibt.

// Welche Zahl worauf aufbaut. Die Reihenfolge ist die des Gesprächs: erst
// steht fest, ob jemand rangegangen ist, dann wen man hatte, dann was
// dabei herauskam.
export const GRUNDLAGEN = [
  { grundlage: "anwahlen",   darauf: ["erreicht", "nicht"] },
  { grundlage: "erreicht",   darauf: ["gatekeeper", "entscheider"] },
  { grundlage: "gatekeeper", darauf: ["weitergeleitet"] },
  { grundlage: "erreicht",   darauf: ["termin", "negativ", "email"] },
];

// Was zu viel ist, gibt beim jeweils grössten Posten nach — eine Regel,
// überall dieselbe. Proportional zu kürzen klingt gerechter, führt bei
// kleinen Zahlen aber zu Ergebnissen, die niemand nachrechnen kann.
function kappe(werte, schluessel, grenze) {
  const kopie = { ...werte };
  let summe = schluessel.reduce((s, k) => s + (kopie[k] || 0), 0);
  while (summe > grenze) {
    const groesster = schluessel.reduce((a, b) => ((kopie[b] || 0) > (kopie[a] || 0) ? b : a));
    if ((kopie[groesster] || 0) <= 0) break; // nichts mehr abzubauen
    kopie[groesster] -= 1;
    summe -= 1;
  }
  return kopie;
}

/**
 * Bringt die Tabelle in sich in Ordnung.
 * @param {object} counts Zähler eines Tages
 * @param {object} reasonCounts Ablehnungsgründe desselben Tages
 */
export function regleEin(counts = {}, reasonCounts = {}) {
  let c = { ...counts };
  for (const regel of GRUNDLAGEN) {
    c = kappe(c, regel.darauf, c[regel.grundlage] || 0);
  }
  // Die Gründe hängen an den negativen Anrufen. Nur nach unten: einen Grund
  // kann man nicht erfinden, wenn einer fehlt.
  const gruende = kappe(reasonCounts, Object.keys(reasonCounts), c.negativ || 0);
  return { counts: c, reasons: gruende };
}

/** Zieht die Buchungen eines einzelnen Anrufs wieder ab. */
export function zieheAnrufAb(counts = {}, reasonCounts = {}, anruf = {}) {
  const c = { ...counts };
  Object.entries(anruf.counts || {}).forEach(([k, v]) => { c[k] = Math.max(0, (c[k] || 0) - (v || 0)); });
  const r = { ...reasonCounts };
  Object.entries(anruf.reasons || {}).forEach(([k, v]) => { r[k] = Math.max(0, (r[k] || 0) - (v || 0)); });
  return { counts: c, reasons: r };
}

/**
 * Eine Korrektur ausführen — und zwar auf der ganzen Tabelle.
 *
 * @param {object} counts       Zähler des Tages
 * @param {object} reasonCounts Ablehnungsgründe des Tages
 * @param {string} feld         Welche Kachel korrigiert wurde
 * @param {object|null} anruf   Der letzte Anruf, falls bekannt
 */
export function korrigiere(counts = {}, reasonCounts = {}, feld, anruf = null) {
  // Eine Anwahl zurückzunehmen heisst: dieser Anruf hat nicht
  // stattgefunden. Dann muss auch alles weg, was er gebucht hat.
  if (feld === "anwahlen" && anruf) {
    const abgezogen = zieheAnrufAb(counts, reasonCounts, anruf);
    return regleEin(abgezogen.counts, abgezogen.reasons);
  }
  const c = { ...counts, [feld]: Math.max(0, (counts[feld] || 0) - 1) };
  return regleEin(c, reasonCounts);
}

/**
 * Alle abhängigen Zahlen im selben Verhältnis mitziehen.
 *
 * Für den Fall, dass eine Zahl nicht nur falsch, sondern ANTEILIG zu hoch
 * war — etwa weil die Anwahlen von gestern im heutigen Tag gelandet sind.
 * Dann stecken die fremden Anrufe auch in "erreicht", in den Terminen und
 * in den Ablehnungsgründen, und ein blosses Auflösen der Widersprüche
 * liesse sie stehen.
 *
 * Gekürzt wird kaufmännisch gerundet, damit aus 3 Terminen bei einer
 * Halbierung 2 werden und nicht 1 — im Zweifel bleibt lieber ein Termin zu
 * viel stehen als einer zu wenig, denn den einen sieht man in der Liste,
 * den anderen nie wieder.
 *
 * @param {string} feld  Das Feld, das gesetzt wurde
 * @param {number} alt   Sein bisheriger Wert
 * @param {number} neu   Sein neuer Wert
 */
export function ziehreAnteiligMit(counts = {}, reasonCounts = {}, feld, alt, neu) {
  // Ohne Grundlage kein Verhältnis: von 0 aus lässt sich nichts kürzen,
  // und nach oben wird ohnehin nie mitgezogen.
  if (!alt || neu >= alt) return regleEin({ ...counts, [feld]: neu }, reasonCounts);

  const faktor = neu / alt;
  const c = { ...counts, [feld]: neu };
  Object.keys(c).forEach((k) => {
    if (k === feld) return;
    c[k] = Math.round((c[k] || 0) * faktor);
  });
  const r = {};
  Object.keys(reasonCounts).forEach((k) => { r[k] = Math.round((reasonCounts[k] || 0) * faktor); });

  // Danach trotzdem einregeln: Rundung kann eine Zahl knapp über ihre
  // Grundlage heben.
  return regleEin(c, r);
}

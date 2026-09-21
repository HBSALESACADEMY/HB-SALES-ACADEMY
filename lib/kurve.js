// Die Mathematik hinter der Verlaufskurve.
//
// Von Hand gerechnet, nicht mit einer Diagramm-Bibliothek: Die
// Sicherheitsregeln dieser Anwendung lassen keine fremden Skripte zu
// (siehe die Prüfung in npm run pruefe).
//
// Eine Kurve sagt "wie hat sich das entwickelt". Balken sagen "wie viel
// war an diesem Tag". Für sieben Tage Anwahlen ist die Entwicklung die
// interessantere Frage — deshalb hier die Kurve.

/**
 * Die Punkte in Bildkoordinaten.
 *
 * Der Maßstab beginnt immer bei 0: Eine Kurve, die bei ihrem eigenen
 * Minimum anfängt, macht aus 48 und 50 Anwahlen einen Berg und einen Abgrund.
 */
export function punkteFuer(werte = [], breite = 300, hoehe = 80, rand = 4) {
  const n = werte.length;
  if (!n) return { punkte: [], hoechster: 0 };
  const hoechster = Math.max(1, ...werte.map((w) => Number(w) || 0));
  const nutzbar = Math.max(1, hoehe - rand * 2);
  const schritt = n > 1 ? breite / (n - 1) : 0;
  return {
    hoechster,
    punkte: werte.map((w, i) => ({
      x: n > 1 ? i * schritt : breite / 2,
      y: rand + (1 - (Number(w) || 0) / hoechster) * nutzbar,
      wert: Number(w) || 0,
    })),
  };
}

/**
 * Ein weicher Pfad durch die Punkte (Catmull-Rom, in Bézier übersetzt).
 *
 * "spannung" bestimmt, wie rund die Kurve läuft. 0 ergibt Geraden, Werte
 * über etwa 0.3 schwingen über die Messpunkte hinaus — und eine Kurve, die
 * unter null schwingt, behauptet Zahlen, die es nicht gibt.
 */
export function weicherPfad(punkte = [], spannung = 0.2) {
  if (punkte.length < 2) return "";
  const d = [`M ${punkte[0].x.toFixed(2)} ${punkte[0].y.toFixed(2)}`];
  for (let i = 0; i < punkte.length - 1; i += 1) {
    const p0 = punkte[i - 1] || punkte[i];
    const p1 = punkte[i];
    const p2 = punkte[i + 1];
    const p3 = punkte[i + 2] || p2;
    const c1x = p1.x + (p2.x - p0.x) * spannung;
    const c2x = p2.x - (p3.x - p1.x) * spannung;
    // Die Kontrollpunkte dürfen senkrecht nicht über die beiden Messpunkte
    // hinausgehen, zwischen denen sie liegen.
    //
    // Ohne diese Grenze schwingt die Kurve bei einem Sprung (zwei gleiche
    // Werte, dann ein hoher) über das Ziel hinaus: gemessen bis unter null
    // und über den Höchstwert. Eine Kurve, die unter null taucht, behauptet
    // Anwahlen, die es nicht gab — und genau das darf ein Diagramm nie.
    const oben = Math.min(p1.y, p2.y);
    const unten = Math.max(p1.y, p2.y);
    const halte = (y) => Math.min(unten, Math.max(oben, y));
    const c1y = halte(p1.y + (p2.y - p0.y) * spannung);
    const c2y = halte(p2.y - (p3.y - p1.y) * spannung);
    d.push(`C ${c1x.toFixed(2)} ${c1y.toFixed(2)}, ${c2x.toFixed(2)} ${c2y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`);
  }
  return d.join(" ");
}

/** Dieselbe Kurve, unten geschlossen — die Fläche darunter. */
export function flaechenPfad(punkte = [], hoehe = 80, spannung = 0.2) {
  const linie = weicherPfad(punkte, spannung);
  if (!linie) return "";
  const erster = punkte[0];
  const letzter = punkte[punkte.length - 1];
  return `${linie} L ${letzter.x.toFixed(2)} ${hoehe} L ${erster.x.toFixed(2)} ${hoehe} Z`;
}

/**
 * Tageswerte aus den Anruf-Zeilen — eine Reihe je Kennzahl.
 *
 * Lückenlos: Ein Tag ohne Eintrag ist eine 0, keine Auslassung. Sonst
 * verbindet die Kurve zwei Wochen zu einer Strecke und behauptet einen
 * Verlauf, den es nicht gab.
 */
export function tagesReihe(zeilen = [], schluessel = "anwahlen", von = null, bis = null) {
  const summen = new Map();
  zeilen.forEach((z) => {
    const tag = z?.log_date;
    if (!tag) return;
    const wert = Number(z?.counts?.[schluessel]) || 0;
    summen.set(tag, (summen.get(tag) || 0) + wert);
  });
  const tage = [...summen.keys()].sort();
  const start = von || tage[0];
  const ende = bis || tage[tage.length - 1];
  if (!start || !ende) return [];

  const reihe = [];
  const d = new Date(`${start}T12:00:00Z`);
  const letzter = new Date(`${ende}T12:00:00Z`);
  // Obergrenze, damit ein falsch gesetzter Zeitraum nicht zehntausend
  // Punkte zeichnet.
  while (d <= letzter && reihe.length < 400) {
    const tag = d.toISOString().slice(0, 10);
    reihe.push({ tag, wert: summen.get(tag) || 0 });
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return reihe;
}

/**
 * Welcher Punkt liegt unter dem Zeiger?
 *
 * Gerechnet wird über den ANTEIL der Breite, nicht über Pixel: Die Kurve
 * wird in der Breite gestreckt (preserveAspectRatio="none"), ein
 * Pixelvergleich träfe deshalb bei jeder Fenstergrösse eine andere Stelle.
 *
 * Gerundet statt abgeschnitten: Wer zwischen zwei Tagen steht, meint den
 * näheren.
 */
export function punktBeiAnteil(anzahl, anteil) {
  if (!anzahl || anzahl < 1) return null;
  const sicher = Math.min(1, Math.max(0, Number(anteil) || 0));
  return Math.min(anzahl - 1, Math.max(0, Math.round(sicher * (anzahl - 1))));
}

/** Der Tag einer Reihe als kurzer Text: "Di, 22.9." */
export function tagKurz(tag) {
  if (!tag) return "";
  const d = new Date(`${tag}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return "";
  const WOCHENTAGE = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
  return `${WOCHENTAGE[d.getUTCDay()]}, ${d.getUTCDate()}.${d.getUTCMonth() + 1}.`;
}

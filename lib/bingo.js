// Cold Call Bingo — die Regeln, getrennt von der Darstellung.
//
// Beim Telefonieren nebenbei ein Feld abhaken: das Spiel darf nie behaupten,
// jemand habe gewonnen, wenn er nicht gewonnen hat — und schon gar nicht
// umgekehrt. Deshalb liegt die Gewinnprüfung hier, mit Test.

export const GROESSE = 5;
export const FELDER = GROESSE * GROESSE; // 25
export const MITTE = Math.floor(FELDER / 2); // 12 — das Freifeld

// Alle zwölf Gewinnlinien: fünf Reihen, fünf Spalten, zwei Diagonalen.
// Einmal ausgerechnet statt in der Prüfung jedes Mal neu zusammengesetzt.
export const LINIEN = (() => {
  const linien = [];
  for (let r = 0; r < GROESSE; r++) {
    linien.push(Array.from({ length: GROESSE }, (_, s) => r * GROESSE + s));
    linien.push(Array.from({ length: GROESSE }, (_, s) => s * GROESSE + r));
  }
  linien.push(Array.from({ length: GROESSE }, (_, i) => i * GROESSE + i));
  linien.push(Array.from({ length: GROESSE }, (_, i) => i * GROESSE + (GROESSE - 1 - i)));
  return linien;
})();

// Welche Linien vollständig sind. Die Mitte zählt immer als abgehakt — sie
// ist das Freifeld, das mit dem ersten Anruf als geschenkt gilt.
export function volleLinien(abgehakt) {
  const gesetzt = new Set(abgehakt || []);
  gesetzt.add(MITTE);
  return LINIEN.filter((linie) => linie.every((feld) => gesetzt.has(feld)));
}

export function hatBingo(abgehakt) {
  return volleLinien(abgehakt).length > 0;
}

// Alle Felder, die zu einer vollen Linie gehören — für die Hervorhebung.
export function gewinnFelder(abgehakt) {
  const felder = new Set();
  volleLinien(abgehakt).forEach((linie) => linie.forEach((f) => felder.add(f)));
  return felder;
}

// Punkte: 10 für den Anrufer je Wort, 5 für die Person, die es zugesteckt
// hat, 100 einmalig für das erste Bingo. Als eigene Zahlen, damit sie nicht
// an drei Stellen im Code stehen und auseinanderlaufen.
export const PUNKTE = { wort: 10, zusteller: 5, bingo: 100 };

// Vorrat für "Restliche Felder auffüllen". Bewusst Wörter, die im
// Kaltakquise-Alltag WIRKLICH fallen — ein Bingo mit Fantasiewörtern hakt
// niemand ab.
export const ZUFALLSWOERTER = [
  "Kein Interesse", "Schicken Sie mal was", "Kein Budget", "Rufen Sie später an",
  "Wir haben schon jemanden", "Wer sind Sie nochmal?", "Woher haben Sie die Nummer?",
  "Chef ist im Termin", "Kein Bedarf", "Zu teuer", "Melde mich selbst",
  "Bin gerade im Auto", "Schicken Sie eine E-Mail", "Keine Zeit", "Was kostet das?",
  "Wie sind Sie darauf gekommen?", "Wir sind zufrieden", "Nicht zuständig",
  "Rufen Sie nie wieder an", "Klingt interessant", "Machen wir intern",
  "Das kennen wir schon", "Ich leite das weiter", "Kein Entscheider",
  "Schicken Sie Unterlagen",
];

// Zufällig, aber ohne Wiederholung und ohne das, was schon auf der Karte
// steht — zweimal dasselbe Wort wäre ein geschenktes Feld.
export function zufallsWoerter(anzahl, schonVorhanden = []) {
  const belegt = new Set((schonVorhanden || []).map((w) => String(w).trim().toLowerCase()));
  const uebrig = ZUFALLSWOERTER.filter((w) => !belegt.has(w.toLowerCase()));
  for (let i = uebrig.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [uebrig[i], uebrig[j]] = [uebrig[j], uebrig[i]];
  }
  return uebrig.slice(0, Math.max(0, anzahl));
}

// Welche Plätze auf der Karte noch frei sind (die Mitte nie).
export function freiePlaetze(felder) {
  const belegt = new Set((felder || []).map((f) => f.position));
  const frei = [];
  for (let i = 0; i < FELDER; i++) {
    if (i !== MITTE && !belegt.has(i)) frei.push(i);
  }
  return frei;
}

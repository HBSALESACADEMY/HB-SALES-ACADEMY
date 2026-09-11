// Einen Zeitraum mit dem davor vergleichen.
//
// Eine Zahl allein sagt nichts. "312 Anwahlen" ist gut oder schlecht, je
// nachdem, was letzte Woche war — und genau das weiss niemand auswendig.
// Deshalb steht die Veränderung daneben, überall gleich gerechnet.

import { tagPlus } from "./woche.js";

/** Wie viele Kalendertage ein Zeitraum umfasst, beide Grenzen mitgezählt. */
export function tageImZeitraum(von, bis) {
  if (!von || !bis) return 0;
  const a = new Date(`${von}T00:00:00Z`).getTime();
  const b = new Date(`${bis}T00:00:00Z`).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / 86400000) + 1;
}

/**
 * Der gleich lange Zeitraum unmittelbar davor.
 *
 * Gleich lang ist die Bedingung: eine Woche mit sieben Tagen gegen einen
 * Vormonat zu stellen ergibt eine Zahl, die immer dramatisch aussieht und
 * nichts bedeutet. Und lückenlos anschliessend, damit kein Tag doppelt
 * zählt oder herausfällt.
 */
export function vorherigerZeitraum({ von, bis } = {}) {
  const tage = tageImZeitraum(von, bis);
  if (!tage) return null;
  const vorherBis = tagPlus(von, -1);
  return { von: tagPlus(vorherBis, -(tage - 1)), bis: vorherBis };
}

/**
 * Wie der Vergleichszeitraum heisst — im Dativ, denn er steht hinter
 * "gegenüber". "gegenüber die 7 Tage davor" liest sich wie ein Fehler.
 */
export function vergleichsName(art) {
  if (art === "heute") return "gestern";
  if (art === "woche") return "den 7 Tagen davor";
  if (art === "monat") return "den 30 Tagen davor";
  if (art === "quartal") return "dem Vorquartal";
  return "dem Zeitraum davor";
}

/**
 * Die Veränderung zwischen zwei Zahlen.
 *
 * Ohne Vorwert gibt es KEINE Prozentzahl. Von null auf zwölf sind nicht
 * "unendlich Prozent mehr" und auch nicht "100 % mehr" — es ist schlicht
 * neu, und das muss die Anzeige sagen dürfen, statt eine Zahl zu erfinden.
 */
export function differenz(jetzt = 0, davor = 0) {
  const delta = jetzt - davor;
  return {
    wert: jetzt,
    davor,
    delta,
    prozent: davor > 0 ? Math.round((delta / davor) * 100) : null,
    richtung: delta > 0 ? "hoch" : delta < 0 ? "runter" : "gleich",
  };
}

/**
 * Der Text hinter einer Zahl: "+18 % gegenüber der Vorwoche".
 *
 * Bewusst mit Vorzeichen und in Prozent, wo es eines gibt — und sonst mit
 * der reinen Differenz. Ein "+3" ist bei kleinen Zahlen ehrlicher als ein
 * "+300 %", das nach einem Durchbruch klingt.
 */
export function vergleichsText(d, name = "dem Zeitraum davor") {
  if (!d) return "";
  if (d.davor === 0 && d.wert === 0) return `unverändert gegenüber ${name}`;
  if (d.davor === 0) return `neu gegenüber ${name}`;
  if (d.delta === 0) return `unverändert gegenüber ${name}`;
  const zeichen = d.delta > 0 ? "+" : "−";
  const betrag = Math.abs(d.delta);
  const prozent = d.prozent === null ? "" : ` (${d.delta > 0 ? "+" : "−"}${Math.abs(d.prozent)} %)`;
  return `${zeichen}${betrag}${prozent} gegenüber ${name}`;
}

// Einen Zeitraum mit dem davor vergleichen.
//
// Eine Zahl allein sagt nichts. "312 Anwahlen" ist gut oder schlecht, je
// nachdem, was letzte Woche war — und genau das weiss niemand auswendig.
// Deshalb steht die Veränderung daneben, überall gleich gerechnet.

import { tagPlus } from "./woche.js";

// Womit verglichen wird. Die Wahl gehört der Person, die auswertet: Ob
// diese Woche mit der Vorwoche oder mit derselben Woche im Vormonat zu
// vergleichen ist, hängt vom Geschäft ab und nicht von einer Voreinstellung.
export const VERGLEICHS_ARTEN = [
  ["davor", "Zeitraum davor"],
  ["woche", "Woche davor"],
  ["monat", "Monat davor"],
  ["jahr", "Jahr davor"],
  ["eigen", "Eigener Zeitraum"],
  ["keiner", "Kein Vergleich"],
];

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


/**
 * Denselben Tag um Monate oder Jahre zurückschieben.
 *
 * Mit Kappung auf den letzten gültigen Tag: der 31. März minus ein Monat
 * ist der 28. Februar und nicht der 3. März. Über Millisekunden gerechnet
 * käme genau das heraus, und niemand würde es bemerken.
 */
export function verschiebeUmMonate(tagStr, monate) {
  const [j, m, t] = String(tagStr).split("-").map(Number);
  if (!j || !m || !t) return tagStr;
  const gesamt = (j * 12 + (m - 1)) - monate;
  const jahr = Math.floor(gesamt / 12);
  const monat = (gesamt % 12) + 1;
  const letzter = new Date(Date.UTC(jahr, monat, 0)).getUTCDate();
  const tag = Math.min(t, letzter);
  return `${jahr}-${String(monat).padStart(2, "0")}-${String(tag).padStart(2, "0")}`;
}

/**
 * Der gewählte Vergleichszeitraum — oder null, wenn keiner gewünscht ist.
 *
 * "Zeitraum davor" bleibt die Voreinstellung, weil sie immer stimmt. Alles
 * andere verschiebt denselben Zeitraum um eine Woche, einen Monat oder ein
 * Jahr zurück: derselbe Wochentag, dieselbe Länge, nur früher.
 */
export function vergleichsZeitraum(art, { von, bis } = {}, eigen = {}) {
  if (!von || !bis || art === "keiner") return null;
  if (art === "eigen") {
    if (!eigen?.von || !eigen?.bis) return null;
    return eigen.von <= eigen.bis
      ? { von: eigen.von, bis: eigen.bis }
      : { von: eigen.bis, bis: eigen.von };
  }
  if (art === "woche") return { von: tagPlus(von, -7), bis: tagPlus(bis, -7) };
  if (art === "monat") return { von: verschiebeUmMonate(von, 1), bis: verschiebeUmMonate(bis, 1) };
  if (art === "jahr") return { von: verschiebeUmMonate(von, 12), bis: verschiebeUmMonate(bis, 12) };
  return vorherigerZeitraum({ von, bis });
}

/** Wie der gewählte Vergleich heisst — im Dativ, er steht hinter "gegenüber". */
export function vergleichsArtName(art, zeitraumArt) {
  if (art === "woche") return "der Woche davor";
  if (art === "monat") return "dem Monat davor";
  if (art === "jahr") return "dem Jahr davor";
  if (art === "eigen") return "dem gewählten Zeitraum";
  return vergleichsName(zeitraumArt);
}

/**
 * Wie viele Tage sich zwei Zeiträume überschneiden.
 *
 * Ein Vergleich mit sich selbst ist keiner: Wer "30 Tage" wählt und mit
 * "der Woche davor" vergleicht, hat 23 gemeinsame Tage in beiden Zahlen.
 * Die Veränderung wirkt dann klein, und zwar immer. Das muss dastehen,
 * statt dass die Zahl stillschweigend nichts aussagt.
 */
export function ueberschneidung(a, b) {
  if (!a?.von || !a?.bis || !b?.von || !b?.bis) return 0;
  const von = a.von > b.von ? a.von : b.von;
  const bis = a.bis < b.bis ? a.bis : b.bis;
  if (von > bis) return 0;
  return tageImZeitraum(von, bis);
}

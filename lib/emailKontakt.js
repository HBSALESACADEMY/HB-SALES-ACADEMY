// Wortlaut und Regeln rund um die E-Mail-Kontakte (migration_138).
//
// Ein eigener Ort dafür, weil dieselben Bezeichnungen im Call Tracker, im
// Marketing-Reiter und in der Telegram-Meldung auftauchen. Drei Stellen,
// drei Formulierungen — und niemand weiss mehr, ob "erledigt" dasselbe
// meint wie "verschickt".

export const EMAIL_STATUS = {
  offen: "Offen",
  verschickt: "Mail verschickt",
  termin: "Termin daraus geworden",
  keine_antwort: "Keine Antwort",
  kein_interesse: "Kein Interesse",
};

// Reihenfolge im Filter und in der Liste: nach dem, was Arbeit macht.
// "Offen" steht oben, weil dort jemand handeln muss.
export const STATUS_REIHENFOLGE = ["offen", "verschickt", "termin", "keine_antwort", "kein_interesse"];

// Welche Status als abgeschlossen gelten — sie tauchen im Standardfilter
// nicht auf, damit die Liste nicht mit Erledigtem zuwächst.
export const ERLEDIGT = ["termin", "keine_antwort", "kein_interesse"];

export function istErledigt(status) {
  return ERLEDIGT.includes(status);
}

/** Grobe Prüfung — die genaue kann nur der Mailserver machen. */
/**
 * Eine Adresse säubern, bevor sie gespeichert wird.
 *
 * Adressen werden aus Mails, Webseiten und PDFs kopiert, und dabei kommen
 * Zeichen mit, die man nicht sieht: geschützte Leerzeichen, Zeichen der
 * Breite null, die Steuerzeichen für Schreibrichtung. Die Adresse sieht
 * danach richtig aus und ist es nicht — Resend lehnt sie ab mit "contains
 * non-ASCII characters", und gesucht wird dann beim Absender.
 */
export function bereinigeAdresse(text) {
  return String(text || "")
    // Unsichtbares zuerst, sonst bleibt es nach dem Trimmen in der Mitte
    // stehen: Breite null, Wortverbinder, Byte-Reihenfolge-Marke,
    // Schreibrichtung.
    .replace(/[\u200B-\u200F\u2060\uFEFF\u202A-\u202E]/g, "")
    // Geschützte und schmale Leerzeichen wie gewöhnliche behandeln.
    .replace(/[\u00A0\u2000-\u200A\u3000]/g, " ")
    // Gedankenstriche zu Bindestrichen. Word und Outlook machen aus
    // "bauplanung-nord" beim Tippen "bauplanung–nord", und die Adresse
    // sieht danach fast gleich aus. Die Umwandlung ist sicher: im
    // Domainnamen ist ausser Buchstaben, Ziffern und dem Bindestrich
    // ohnehin nichts erlaubt, ein Gedankenstrich kann dort also nie
    // gemeint sein.
    .replace(/[\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]/g, "-")
    // Das grosse @ und der grosse Punkt aus fernöstlichen Tastaturen.
    .replace(/\uFF20/g, "@").replace(/\uFF0E/g, ".")
    .trim();
}

// Wie das Zeichen heisst, das im Weg steht. "U+2013" sagt niemandem etwas;
// "Gedankenstrich" sagt sofort, wonach man sucht.
const ZEICHEN_NAMEN = {
  "U+00A0": "geschütztes Leerzeichen",
  "U+200B": "Zeichen der Breite null",
  "U+2013": "Gedankenstrich",
  "U+2014": "langer Gedankenstrich",
  "U+00FC": "ü", "U+00F6": "ö", "U+00E4": "ä", "U+00DF": "ß",
  "U+00DC": "Ü", "U+00D6": "Ö", "U+00C4": "Ä",
};

/** Ein Zeichen benennen, soweit es einen geläufigen Namen hat. */
export function zeichenName(code) {
  return ZEICHEN_NAMEN[code] ? `${code} (${ZEICHEN_NAMEN[code]})` : code;
}

/**
 * Die Zeichen einer Adresse, die kein ASCII sind — für die Fehlermeldung.
 *
 * Als Codepunkt benannt, nicht als Zeichen: ein Zeichen der Breite null
 * lässt sich nicht anzeigen, und "die Adresse enthält ␣" hilft niemandem.
 */
export function fremdeZeichen(text) {
  return [...new Set(String(text || "").split("").filter((z) => z.charCodeAt(0) > 127))]
    .map((z) => zeichenName(`U+${z.charCodeAt(0).toString(16).toUpperCase().padStart(4, "0")}`));
}

/**
 * Ist das eine Adresse, die auch verschickt werden kann?
 *
 * Ausdrücklich nur ASCII. Adressen mit Umlaut sind technisch möglich, aber
 * der Versanddienst lehnt sie ab — und eine Adresse, an die nichts
 * rausgeht, ist im Marketing keine gültige Adresse, sondern eine Falle,
 * die erst beim Senden zuschnappt.
 */
export function gueltigeAdresse(text) {
  const sauber = bereinigeAdresse(text);
  if (fremdeZeichen(sauber).length) return false;
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(sauber);
}

/**
 * Wie viele Kontakte zu einem Termin geführt haben.
 * Ohne verschickte Mails gibt es keine Quote — und nicht etwa null Prozent.
 */
export function marketingQuote(kontakte = []) {
  const bearbeitet = kontakte.filter((k) => k.status !== "offen");
  if (!bearbeitet.length) return null;
  return Math.round((kontakte.filter((k) => k.status === "termin").length / bearbeitet.length) * 100);
}

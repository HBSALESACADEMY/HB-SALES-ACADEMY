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
export function gueltigeAdresse(text) {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(text || "").trim());
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

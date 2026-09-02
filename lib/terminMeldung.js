// Welche Termin-Änderung eine Telegram-Meldung wert ist.
//
// Bisher ging jede Änderung raus. Nach ein paar Tagen liest niemand mehr
// mit, und dann geht die eine Meldung unter, auf die es ankommt — eine
// Absage eine Stunde vor dem Termin.
//
// Die Regel dahinter, in einem Satz: Gemeldet wird, was den KALENDER
// ändert oder was ein ABSCHLUSS ist. Alles andere steht in der App und
// wird dort gelesen, wenn jemand hinsieht.
//
// Gemeldet:
//   - Termin verschoben        → alle müssen umplanen
//   - Termin abgesagt          → der Termin fällt aus
//   - Termin gelöscht          → der Termin fällt aus
//   - Folgetermin angelegt     → ein neuer Zeitpunkt im Kalender
//   - Kunde geworden           → das Ergebnis, auf das alle hinarbeiten
//
// Nicht gemeldet:
//   - Notiz, Telefonnummer, Firma ergänzt   → ändert für niemanden etwas
//   - Status "wahrgenommen"                 → der Normalfall
//   - Ergebnis "Absage" / "Folgetermin"     → steht in der Auswertung;
//     beim Folgetermin meldet sich ohnehin der neue Termin selbst

export const MELDENSWERT = {
  verschoben: "Termin verschoben",
  abgesagt: "Termin abgesagt",
  geloescht: "Termin gelöscht",
  folgetermin: "Folgetermin angelegt",
  kunde: "Kunde geworden",
};

/**
 * @param {string} ereignis  status | ergebnis | folgetermin | bearbeitet | geloescht
 * @param {object} details   { status, outcome, zeitpunktGeaendert }
 * @returns {string|null}    Der Grund der Meldung, oder null für "still"
 */
export function meldungsGrund(ereignis, details = {}) {
  if (ereignis === "geloescht") return "geloescht";
  if (ereignis === "folgetermin") return "folgetermin";

  // Eine Bearbeitung zählt nur, wenn sich der ZEITPUNKT geändert hat. Wer
  // eine Telefonnummer nachträgt, muss dafür nicht das ganze Team wecken.
  if (ereignis === "bearbeitet") return details.zeitpunktGeaendert ? "verschoben" : null;

  if (ereignis === "status") return details.status === "abgesagt" ? "abgesagt" : null;
  if (ereignis === "ergebnis") return details.outcome === "kunde" ? "kunde" : null;

  return null;
}

export function sollMeldung(ereignis, details = {}) {
  return meldungsGrund(ereignis, details) !== null;
}

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

/**
 * Hat sich der Zeitpunkt wirklich geändert?
 *
 * Nicht über die Zeichenkette: Postgres gibt "2026-09-26T12:00:00+00:00"
 * zurück, toISOString() schreibt "2026-09-26T12:00:00.000Z" — derselbe
 * Zeitpunkt, verschiedene Texte. Der Vergleich mit "!==" war deshalb IMMER
 * wahr, sobald ein Termin überhaupt eine Zeit hatte: Wer im Bearbeiten-
 * Dialog nur eine Telefonnummer nachtrug oder einen Haken setzte, löste
 * "🕐 Termin verschoben" an die ganze Gruppe aus.
 *
 * Auf die Minute genau, nicht auf die Millisekunde: Ein Formularfeld hat
 * keine Sekunden, und ein Termin, der sich um 400 Millisekunden bewegt,
 * ist keine Verschiebung.
 */
export function zeitpunktGeaendert(vorher, nachher) {
  if (!vorher && !nachher) return false;
  if (!vorher || !nachher) return true;
  const a = new Date(vorher).getTime();
  const b = new Date(nachher).getTime();
  // Unlesbare Daten: dann bleibt nur der Textvergleich, und im Zweifel
  // meldet die Academy lieber.
  if (Number.isNaN(a) || Number.isNaN(b)) return String(vorher) !== String(nachher);
  return Math.floor(a / 60000) !== Math.floor(b / 60000);
}

// Was aus einem Termin geworden ist.
//
// Drei Ergebnisse, an einer Stelle benannt. Vorher standen dieselben
// Bezeichnungen in vier Dateien, und sie liefen bereits auseinander:
// "Absage", "Überlegt (Follow-up)", "überlegt".
//
// Das Wort "Absage" ist dabei absichtlich verschwunden. Ein Termin hat
// einen STATUS — geplant, wahrgenommen, abgesagt — und ein ERGEBNIS. In
// derselben Karte standen damit "Abgesagt" und "Absage" nebeneinander und
// meinten Verschiedenes: das eine, dass das Gespräch nicht stattfand, das
// andere, dass es stattfand und nichts daraus wurde. Wer das verwechselt,
// verfälscht beide Zahlen.
export const ERGEBNISSE = [
  { wert: "kunde", label: "Kunde geworden", hinweis: "Der Abschluss" },
  { wert: "follow_up", label: "Überlegt noch", hinweis: "Der Kontakt lebt, entschieden ist nichts" },
  {
    wert: "absage",
    label: "Kein Abschluss",
    hinweis: "Das Gespräch war, ein Kunde wurde es nicht — kein Interesse, kein Budget, falscher Zeitpunkt",
  },
];

export const ERGEBNIS_LABELS = Object.fromEntries(ERGEBNISSE.map((e) => [e.wert, e.label]));

/** Die Bezeichnung eines Ergebnisses — leer heisst "noch offen". */
export function ergebnisLabel(wert) {
  return ERGEBNIS_LABELS[wert] || "";
}

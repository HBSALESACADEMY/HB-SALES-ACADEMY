// Abstände für das automatische Aktualisieren von Seiten.
//
// Vorher fragten zehn Stellen stur alle 20 Sekunden nach — auch dann, wenn
// die Academy nur in einem Hintergrund-Tab offen lag. Allein die Seitenleiste
// macht 12 Abfragen pro Runde; bei acht Stunden geöffneter Academy sind das
// rund 17.000 Abfragen pro Person und Tag, für Daten, die sich meist gar
// nicht geändert haben.
//
// Alle betroffenen Stellen fragen jetzt nur noch ab, wenn der Tab sichtbar
// ist, und aktualisieren beim Zurückwechseln sofort einmal. Dadurch ist die
// Ansicht beim Hinschauen sogar frischer als vorher, obwohl insgesamt
// deutlich weniger abgefragt wird.
export const ABSTAND = {
  // Seite hat eine Echtzeit-Verbindung (Dashboard, Seitenleiste,
  // Nutzerverwaltung) — Änderungen kommen ohnehin sofort an, die Abfrage ist
  // nur noch Sicherheitsnetz, falls die Verbindung stillschweigend abbricht.
  MIT_ECHTZEIT: 5 * 60 * 1000,
  // Keine Echtzeit, aber Kolleg:innen ändern hier laufend etwas (Termine).
  LAUFEND: 60 * 1000,
  // Auswertungen und Verwaltung — hier reicht gelegentlich.
  GELEGENTLICH: 2 * 60 * 1000,
};

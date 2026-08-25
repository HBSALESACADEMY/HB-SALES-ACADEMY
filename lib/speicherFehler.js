// Fehlermeldungen des Dateispeichers in verständliches Deutsch übersetzen.
//
// Sie kommen englisch und technisch an ("new row violates row-level security
// policy"). Für die Person, die gerade eine Aufnahme hochladen wollte, ist
// das keine Auskunft — sie kann daraus weder ablesen, ob sie etwas falsch
// gemacht hat, noch ob sie es gleich nochmal versuchen soll.
const UEBERSETZUNGEN = [
  [/row-level security|not authorized|permission/i,
    "Der Upload wurde abgelehnt. Melde dich einmal neu an — hilft das nicht, sag der Verwaltung Bescheid."],
  [/payload too large|exceeded the maximum|entity too large|413/i,
    "Die Datei ist zu groß für den Speicher. Kürze die Aufnahme oder nimm sie in geringerer Qualität auf."],
  [/bucket not found/i,
    "Der Speicherort für Aufnahmen fehlt. Das muss die Verwaltung einrichten."],
  [/invalid key/i,
    "Der Dateiname enthält Zeichen, die der Speicher nicht annimmt. Benenne die Datei um (nur Buchstaben, Zahlen, Bindestrich)."],
  [/already exists/i,
    "Diese Datei liegt schon im Speicher. Versuche es noch einmal."],
  [/failed to fetch|network|timeout|aborted/i,
    "Die Verbindung ist abgebrochen. Auf dem Handy passiert das bei wechselndem Empfang — am besten im WLAN nochmal versuchen."],
];

export function verstaendlicherSpeicherFehler(fehler, ersatz = "Hochladen fehlgeschlagen.") {
  const text = typeof fehler === "string" ? fehler : fehler?.message || "";
  const treffer = UEBERSETZUNGEN.find(([muster]) => muster.test(text));
  // Die technische Meldung bleibt hinten dran: sie hilft bei der Fehlersuche,
  // steht aber nicht mehr allein da.
  if (treffer) return `${treffer[1]}${text ? ` (${text})` : ""}`;
  return text || ersatz;
}

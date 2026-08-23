// Wann eine Störung gemeldet wird — und wann nicht.
//
// Ohne Bremse ist ein Störungsmelder nach einer Woche wertlos: derselbe
// Fehler tritt bei zehn Leuten gleichzeitig auf, das Telefon brummt zwanzig
// Mal, und beim einundzwanzigsten Mal schaut niemand mehr hin. Gemeldet wird
// deshalb jede Störung nur einmal pro Zeitfenster.
export const FENSTER_MS = 30 * 60 * 1000;

export function sollMelden(schluessel, speicher, jetzt = Date.now(), fenster = FENSTER_MS) {
  if (!schluessel) return false;
  // Nicht "if (zuletzt)": der Zeitpunkt 0 ist ein gültiger Wert und wäre
  // hier als "noch nie gemeldet" durchgerutscht.
  const zuletzt = speicher.get(schluessel);
  if (zuletzt !== undefined && jetzt - zuletzt < fenster) return false;
  speicher.set(schluessel, jetzt);
  // Alte Einträge wegräumen, sonst wächst der Speicher mit jeder neuen
  // Fehlermeldung weiter — auf einem lang laufenden Server ein Leck.
  speicher.forEach((zeit, k) => { if (jetzt - zeit > fenster * 2) speicher.delete(k); });
  return true;
}

// Meldungen, die keine Störung sind: erwartete Absagen, abgebrochene
// Anfragen beim Seitenwechsel, abgelaufene Sitzungen. Sie sagen dem Nutzer
// etwas, aber sie sind nichts, wofür jemand nachts aufstehen müsste.
const HARMLOS = [
  "sitzung ist abgelaufen",
  "nicht authentifiziert",
  "failed to fetch",
  "networkerror",
  "load failed",
  "aborted",
  "resizeobserver loop",
];

export function istMeldenswert(meldung) {
  const text = String(meldung || "").trim();
  if (text.length < 3) return false;
  const klein = text.toLowerCase();
  return !HARMLOS.some((h) => klein.includes(h));
}

// Der Schlüssel fasst gleichartige Störungen zusammen: dieselbe Stelle,
// dieselbe Meldung. Zahlen darin (Kennungen, Zeitstempel) fallen weg, sonst
// gilt jede Wiederholung als etwas Neues.
export function meldungsSchluessel(wo, meldung) {
  return `${wo}|${String(meldung || "").toLowerCase().replace(/[0-9a-f-]{8,}/g, "#").replace(/\d+/g, "#").slice(0, 120)}`;
}

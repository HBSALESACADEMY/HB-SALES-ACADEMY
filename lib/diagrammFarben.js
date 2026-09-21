// Farben für alle Diagramme — an einer Stelle, damit dieselbe Sache überall
// dieselbe Farbe hat.
//
// Vorher vergab jedes Diagramm seine Farben nach Reihenfolge. "Terminiert"
// war im einen Kreis grün und im anderen violett, und die Balken der
// Einwand-Verteilung waren alle gleich. Damit sagt Farbe nichts — man muss
// jedes Mal die Legende lesen, statt sie einmal zu lernen.

// Die Reihe für Verteilungen: eine Skala von Graphit nach Türkis, statt
// eines Regenbogens. Karmesin kommt darin NICHT vor — es ist die Farbe für
// Aktionen und für "das ist jetzt", und eine Farbe, die überall auftaucht,
// bedeutet nirgends etwas.
export const PALETTE = [
  "#2FA890",
  "#4E7F8C",
  "#6C7A93",
  "#8A93A8",
  "#5FA8B8",
  "#3E6E78",
  "#A2A9BC",
  "#7E6F8E",
  "#4B5468",
  "#9AB3AE",
];

// Die Farbe für den aktuellen Wert, den letzten Punkt einer Kurve, den
// gewählten Balken. Nur dort — sonst verliert sie ihre Aussage.
export const JETZT = "var(--org-accent, #CE3A5C)";

// Feste Farben für die Zähler des Call Trackers. Sie folgen der Bedeutung:
// Terminiert türkis (Erfolg), Negativ korallenrot, die erreichten Gespräche
// in abgestuften Blautönen, Anwahlen als Summe im ruhigsten davon.
export const FELD_FARBEN = {
  // Anwahlen sind die Summe und die Grundlinie: der ruhigste Ton.
  anwahlen: "#5FA8B8",
  erreicht: "#3E8FA8",
  nicht: "#7C869C",
  // Gatekeeper und Geschäftsführer teilen die erreichten Gespräche auf —
  // deshalb zwei Töne, die zum Blau von "erreicht" passen, statt zweier
  // beliebiger Farben.
  gatekeeper: "#B8894A",
  entscheider: "#2FA890",
  weitergeleitet: "#4E7F8C",
  termin: "#3FBFA6",
  negativ: "#E5716A",
};

// Einwandgründe sind von Organisation zu Organisation verschieden — feste
// Farben je Grund gibt es also nicht. Stabil ist die REIHENFOLGE der
// hinterlegten Gründe: derselbe Grund bekommt dadurch in jeder Ansicht
// dieselbe Farbe, auch wenn eine Liste anders sortiert oder gefiltert ist.
const GRUND_FARBEN = ["#2FA890", "#B8894A", "#7C869C", "#4E7F8C", "#C2685A", "#8A93A8", "#5FA8B8", "#3E6E78"];

export function grundFarbe(gruende, key) {
  const i = (gruende || []).findIndex((g) => (g.key || g) === key);
  return GRUND_FARBEN[(i < 0 ? 0 : i) % GRUND_FARBEN.length];
}

export function feldFarbe(key) {
  return FELD_FARBEN[key] || PALETTE[0];
}

export function paletteFarbe(i) {
  return PALETTE[i % PALETTE.length];
}

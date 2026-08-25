// Farben für alle Diagramme — an einer Stelle, damit dieselbe Sache überall
// dieselbe Farbe hat.
//
// Vorher vergab jedes Diagramm seine Farben nach Reihenfolge. "Terminiert"
// war im einen Kreis grün und im anderen violett, und die Balken der
// Einwand-Verteilung waren alle gleich. Damit sagt Farbe nichts — man muss
// jedes Mal die Legende lesen, statt sie einmal zu lernen.
export const PALETTE = [
  "var(--org-accent, #CE3A5C)",
  "var(--org-color-1, #4C5DC9)",
  "#00C2A8",
  "#F0B23E",
  "#9E8CF0",
  "#3FA7D6",
  "#5FCF6B",
  "#F2795B",
  "#E0669B",
  "#C9A227",
];

// Feste Farben für die Zähler des Call Trackers. Sie folgen der Bedeutung:
// Terminiert grün, Negativ rot, Erreicht/Nicht erreicht zwei klar
// unterscheidbare Blautöne, Anwahlen als Summe im Marken-Indigo.
export const FELD_FARBEN = {
  anwahlen: "var(--org-color-1, #4C5DC9)",
  erreicht: "#3FA7D6",
  nicht: "#9E8CF0",
  // Gatekeeper und Geschäftsführer teilen die erreichten Gespräche auf —
  // deshalb zwei Töne, die zum Blau von "erreicht" passen, statt zweier
  // beliebiger Farben.
  gatekeeper: "#C9A227",
  entscheider: "#00C2A8",
  termin: "#5FCF6B",
  negativ: "#E86A6A",
};

// Einwandgründe sind von Organisation zu Organisation verschieden — feste
// Farben je Grund gibt es also nicht. Stabil ist die REIHENFOLGE der
// hinterlegten Gründe: derselbe Grund bekommt dadurch in jeder Ansicht
// dieselbe Farbe, auch wenn eine Liste anders sortiert oder gefiltert ist.
const GRUND_FARBEN = ["#00C2A8", "#F0B23E", "#9E8CF0", "#3FA7D6", "#F2795B", "#E0669B", "#C9A227", "#5FCF6B"];

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

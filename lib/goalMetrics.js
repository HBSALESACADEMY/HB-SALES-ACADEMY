// Kennzahlen, auf die ein Team-Ziel gesetzt werden kann.
//
// Früher gab es nur die drei Trainings-Kennzahlen. Ein Vertriebsteam misst
// sich aber vor allem an seiner Aktivität am Telefon — deshalb stehen die
// Zähler des Call Trackers und die erfassten Termine jetzt gleichberechtigt
// daneben.
//
// "quelle" sagt, WO der Fortschritt herkommt, weil die drei Arten
// unterschiedlich gezählt werden:
//   zeilen      — eine Zeile je Ereignis, gezählt wird die Anzahl
//   calltracker — Tageszähler in call_log_days.counts, aufsummiert
//   leads       — angelegte Termine im Zeitraum
export const GOAL_METRICS = [
  { key: "roleplay",        label: "Rollenspiele",        gruppe: "Training",     quelle: "zeilen", tabelle: "roleplay_sessions" },
  { key: "quiz",            label: "Quiz",                gruppe: "Training",     quelle: "zeilen", tabelle: "quiz_results" },
  { key: "daily_challenge", label: "Tages-Challenges",    gruppe: "Training",     quelle: "zeilen", tabelle: "daily_challenge_completions" },
  { key: "anwahlen",        label: "Anwahlen",            gruppe: "Call Tracker", quelle: "calltracker", feld: "anwahlen" },
  { key: "erreicht",        label: "Ans Telefon gegangen", gruppe: "Call Tracker", quelle: "calltracker", feld: "erreicht" },
  { key: "nicht",           label: "Nicht erreicht",      gruppe: "Call Tracker", quelle: "calltracker", feld: "nicht" },
  { key: "termin",          label: "Terminiert",          gruppe: "Call Tracker", quelle: "calltracker", feld: "termin" },
  { key: "negativ",         label: "Negative Anrufe",     gruppe: "Call Tracker", quelle: "calltracker", feld: "negativ" },
  { key: "termine",         label: "Termine erfasst",     gruppe: "Vertrieb",     quelle: "leads" },
];

export const GOAL_METRIC_KEYS = GOAL_METRICS.map((m) => m.key);

export function goalMetric(key) {
  return GOAL_METRICS.find((m) => m.key === key) || null;
}

// Label für die Anzeige — unbekannte Schlüssel (etwa aus einer neueren
// Fassung) sollen die Seite nicht leer lassen.
export function goalMetricLabel(key) {
  return goalMetric(key)?.label || key;
}

// Für das Auswahlfeld: nach Gruppe gebündelt, Reihenfolge wie oben.
export function goalMetricGroups() {
  const gruppen = [];
  GOAL_METRICS.forEach((m) => {
    let g = gruppen.find((x) => x.name === m.gruppe);
    if (!g) { g = { name: m.gruppe, metriken: [] }; gruppen.push(g); }
    g.metriken.push(m);
  });
  return gruppen;
}

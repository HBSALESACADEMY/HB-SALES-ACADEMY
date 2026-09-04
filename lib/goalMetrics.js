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
  { key: "email",           label: "E-Mail gewünscht",    gruppe: "Call Tracker", quelle: "calltracker", feld: "email" },
  { key: "negativ",         label: "Negative Anrufe",     gruppe: "Call Tracker", quelle: "calltracker", feld: "negativ" },
  // Seit dem Gatekeeper-Schritt im Assistenten (migration_125): "kommt jemand
  // bis zur Entscheidung durch" ist die Frage, auf die es beim Kaltakquise-
  // Training ankommt — ohne diese Kennzahlen liesse sich darauf kein Ziel setzen.
  { key: "gatekeeper",      label: "Zuerst: Vorzimmer",   gruppe: "Call Tracker", quelle: "calltracker", feld: "gatekeeper" },
  { key: "entscheider",     label: "Zuerst: Entscheider",  gruppe: "Call Tracker", quelle: "calltracker", feld: "entscheider" },
  { key: "weitergeleitet",  label: "Durchgestellt",       gruppe: "Call Tracker", quelle: "calltracker", feld: "weitergeleitet" },
  { key: "termine",         label: "Termine erfasst",     gruppe: "Vertrieb",     quelle: "leads" },
  // Ergebnisse eines Termins — das eigentliche Vertriebsziel. Gezählt wird
  // der Zeitpunkt der ERFASSUNG, nicht der Ergebniseintragung: sonst zählte
  // ein nachträglich korrigiertes Ergebnis in den falschen Zeitraum.
  { key: "kunden",          label: "Kunden gewonnen",     gruppe: "Vertrieb",     quelle: "leads", filterSpalte: "outcome", filterWert: "kunde" },
  { key: "absagen",         label: "Absagen",             gruppe: "Vertrieb",     quelle: "leads", filterSpalte: "outcome", filterWert: "absage" },
  { key: "wahrgenommen",    label: "Termine wahrgenommen", gruppe: "Vertrieb",    quelle: "leads", filterSpalte: "status", filterWert: "wahrgenommen" },
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

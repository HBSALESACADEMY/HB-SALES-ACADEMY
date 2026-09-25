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
  // Die Verbindung brach mitten in der Antwort ab. Auf einem Handy zwischen
  // zwei Funkzellen der Normalfall, und niemand kann etwas dagegen tun
  // (lib/antwortLesen.js).
  "verbindung brach ab",
  // Wie die Browser einen JSON-Fehler formulieren: Safari "The string did
  // not match the expected pattern.", Chrome "Unexpected token '<'", iOS
  // manchmal "JSON Parse error". Drei Texte für ein Problem, und keiner
  // sagt, welche Anfrage es war. Seit dem 25.09.2026 baut
  // lib/antwortLesen.js daraus einen brauchbaren Satz mit Statuscode —
  // diese Rohfassungen hier sind der Rückfall für Stellen, die noch
  // res.json() direkt benutzen, und als Meldung wertlos.
  "did not match the expected pattern",
  "json parse error",
  "unexpected token",
  "unexpected end of json",
];

/**
 * Weicht die Uhr des Geräts ab?
 *
 * Supabase lehnt ein Token ab, dessen Ausstellungszeit in der Zukunft
 * liegt ("JWT issued at future"): Das passiert, wenn die Uhr des Geräts
 * vorgeht. Der Betreiber kann daran nichts ändern — die betroffene Person
 * schon, mit einem Griff in die Systemeinstellungen.
 *
 * Deshalb wird dieser Fall NICHT an den Betreiber gemeldet, sondern der
 * Person erklärt. Ohne diese Unterscheidung kam die Meldung im
 * Hintergrund-Abgleich immer wieder — und die einzige Person, die etwas
 * tun konnte, erfuhr nie davon.
 */
export function istUhrProblem(meldung) {
  const klein = String(meldung || "").toLowerCase();
  return /issued at future|issued in the future|used before issued|clock skew|jwt expired.*future/.test(klein);
}

// Was der betroffenen Person dazu gesagt wird. An einer Stelle, damit der
// Hinweis überall derselbe ist.
export const UHR_HINWEIS = "Die Uhr dieses Geräts weicht von der echten Zeit ab — deshalb lehnt der Server "
  + "die Anmeldung für den Abgleich ab. Stell Datum und Uhrzeit auf „automatisch“, dann läuft es wieder. "
  + "Gezählt wird weiter, deine Zahlen gehen nicht verloren.";

export function istMeldenswert(meldung) {
  const text = String(meldung || "").trim();
  if (text.length < 3) return false;
  const klein = text.toLowerCase();
  // Eine abweichende Geräteuhr ist keine Störung der Academy: Sie lässt
  // sich nur dort beheben, wo sie entsteht (siehe istUhrProblem).
  if (istUhrProblem(klein)) return false;
  return !HARMLOS.some((h) => klein.includes(h));
}

// Der Schlüssel fasst gleichartige Störungen zusammen: dieselbe Stelle,
// dieselbe Meldung. Zahlen darin (Kennungen, Zeitstempel) fallen weg, sonst
// gilt jede Wiederholung als etwas Neues.
export function meldungsSchluessel(wo, meldung) {
  return `${wo}|${String(meldung || "").toLowerCase().replace(/[0-9a-f-]{8,}/g, "#").replace(/\d+/g, "#").slice(0, 120)}`;
}

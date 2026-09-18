import { berlinHeute, tagPlus, wochenStartTag } from "./woche.js";
import { KENNZAHLEN, leereZahlen, tagesName } from "./tagesauswertung.js";

// Der Wochenimpuls des Vertriebsbuddys: was diese Woche zusammenkam,
// verglichen mit der Woche davor — und eine Frage dazu.
//
// Der Zahlenblock entsteht HIER und nicht in der KI. Eine Sprach-KI, die
// Zahlen nacherzählt, verrutscht früher oder später um eine Stelle, und
// dann steht in einer Motivationsnachricht eine Zahl, die es nie gab. Die
// KI schreibt nur die Einordnung dazwischen.

// Freitag: früh genug, dass die Antwort noch in dieselbe Woche fällt.
export const IMPULS_WOCHENTAG = 5;

export const IMPULS_FRAGEN = [
  "Wie hast du dich diese Woche beim Telefonieren gefühlt?",
  "Was war diese Woche dein bestes Gespräch — und woran lag es?",
  "Wo hat es diese Woche am meisten gehakt?",
  "Welcher Einwand kam diese Woche am häufigsten?",
  "Was nimmst du dir für nächste Woche konkret vor?",
  "Was hat dich diese Woche am meisten Zeit gekostet, ohne etwas zu bringen?",
];

/** Dieselbe Woche, dieselbe Frage — aber jede Woche eine andere. */
export function impulsFrage(wocheStart) {
  const nummer = Math.floor(Date.parse(`${wocheStart}T00:00:00Z`) / (7 * 86400000));
  const index = Number.isFinite(nummer) ? ((nummer % IMPULS_FRAGEN.length) + IMPULS_FRAGEN.length) % IMPULS_FRAGEN.length : 0;
  return IMPULS_FRAGEN[index];
}

export function istImpulsTag(jetzt = new Date()) {
  return new Date(`${berlinHeute(jetzt)}T00:00:00Z`).getUTCDay() === IMPULS_WOCHENTAG;
}

/** Die Arbeitstage dieser Woche bis heute — und die volle Woche davor. */
export function impulsWochen(jetzt = new Date()) {
  const heute = berlinHeute(jetzt);
  const start = wochenStartTag(jetzt);
  const diese = [];
  for (let t = start; t <= heute; t = tagPlus(t, 1)) diese.push(t);
  const vorStart = tagPlus(start, -7);
  const vorher = [];
  for (let i = 0; i < 7; i += 1) vorher.push(tagPlus(vorStart, i));
  return { woche: start, heute, diese, vorher, vorwoche: vorStart };
}

/** Die Tageszahlen einer Person über mehrere Tage zusammenzählen. */
export function summiereTage(proTag, tage = [], userId) {
  const summe = leereZahlen();
  tage.forEach((tag) => {
    const zahlen = proTag?.get?.(tag)?.get?.(userId);
    if (!zahlen) return;
    KENNZAHLEN.forEach((k) => { summe[k.key] += Number(zahlen[k.key]) || 0; });
  });
  return summe;
}

export function hatWochenaktivitaet(zahlen) {
  return KENNZAHLEN.some((k) => (zahlen?.[k.key] || 0) > 0);
}

/** Der Zahlenblock — nur Zeilen, in denen etwas steht. */
export function zahlenBlock(zahlen, vorher) {
  const z = zahlen || leereZahlen();
  const v = vorher || leereZahlen();
  return KENNZAHLEN
    .filter((k) => z[k.key] > 0 || v[k.key] > 0)
    .map((k) => {
      const pfeil = z[k.key] > v[k.key] ? " ↑" : z[k.key] < v[k.key] ? " ↓" : " →";
      return `${k.label}: ${z[k.key]} (Vorwoche: ${v[k.key]})${pfeil}`;
    });
}

/** Was sich gegenüber der Vorwoche getan hat — als Sätze für die KI und als Ersatztext. */
export function veraenderungen(zahlen, vorher) {
  const z = zahlen || leereZahlen();
  const v = vorher || leereZahlen();
  const besser = KENNZAHLEN.filter((k) => z[k.key] > v[k.key]).map((k) => k.label);
  const schlechter = KENNZAHLEN.filter((k) => z[k.key] < v[k.key]).map((k) => k.label);
  const staerkste = KENNZAHLEN.filter((k) => z[k.key] > 0).sort((a, b) => z[b.key] - z[a.key])[0] || null;
  return { besser, schlechter, staerkste: staerkste ? { key: staerkste.key, label: staerkste.label, wert: z[staerkste.key] } : null };
}

/**
 * Der Impuls ohne KI.
 *
 * Kein Notnagel, sondern die Grundform: Steht kein Schlüssel bereit oder
 * antwortet die KI nicht, geht trotzdem etwas raus — mit denselben Zahlen
 * und derselben Frage.
 */
export function impulsFallback({ name = "", zahlen, vorher, frage }) {
  const { besser, schlechter, staerkste } = veraenderungen(zahlen, vorher);
  const saetze = [];
  if (staerkste) saetze.push(`Dein stärkster Wert: ${staerkste.label} mit ${staerkste.wert}.`);
  if (besser.length) saetze.push(`Besser als letzte Woche: ${besser.join(", ")}.`);
  if (!besser.length && schlechter.length) saetze.push("Diese Woche lief es ruhiger als letzte. Das kommt vor — nächste Woche zählt neu.");
  saetze.push("Dranbleiben schlägt jeden guten Tag.");
  return impulsNachricht({ name, zahlen, vorher, frage, kiText: saetze.join(" ") });
}

function kopf(name) {
  const vorname = String(name || "").trim().split(/\s+/)[0];
  return `🎯 Deine Woche${vorname ? `, ${vorname}` : ""}`;
}

function antwortHinweis() {
  return "Antworte einfach hier im Chat — ich lese mit.";
}

/** Zahlenblock, KI-Text und Frage zu einer Nachricht zusammensetzen. */
export function impulsNachricht({ name = "", zahlen, vorher, frage, kiText = "", anknuepfung = "" }) {
  const text = String(kiText || "").trim();
  const rueckblick = String(anknuepfung || "").trim();
  return [
    kopf(name),
    "",
    ...zahlenBlock(zahlen, vorher),
    "",
    text,
    rueckblick ? "" : null,
    rueckblick ? `🔁 ${rueckblick}` : null,
    "",
    `❓ ${frage}`,
    antwortHinweis(),
  ].filter((z) => z !== null).filter((z, i, alle) => !(z === "" && alle[i - 1] === "")).join("\n");
}

/** Die Anweisung an die KI für den Wochenimpuls. */
export function impulsAnweisung({ name = "", organisation = "" }) {
  return [
    "Du bist der Vertriebsbuddy der HB Sales Academy — erfahren im Telefonvertrieb, freundlich, direkt, ohne Floskeln.",
    `Du schreibst an ${name || "eine Vertriebsperson"}${organisation ? ` von ${organisation}` : ""}, auf Deutsch und per Du.`,
    "Du bekommst die Zahlen der Woche und der Vorwoche. Schreibe GENAU 2 bis 4 Sätze:",
    "1. Eine ehrliche Einordnung, die sich auf eine konkrete Zahl bezieht.",
    "2. Einen konkreten, kleinen Tipp für die nächste Woche.",
    "Regeln: Keine Zahl erfinden und keine Zahl wiederholen, die ohnehin schon in der Nachricht steht.",
    "Keine Anrede und keine Grussformel, kein Lob auf Vorrat, keine Ausrufezeichen-Kaskaden.",
    "Bei schwachen Zahlen kein Vorwurf, sondern ein nächster Schritt. Stelle keine Frage — die kommt danach.",
  ].join("\n");
}

/** Die Anweisung an die KI für die laufende Unterhaltung. */
export function gespraechsAnweisung({ name = "", organisation = "", zahlen, vorher }) {
  return [
    "Du bist der Vertriebsbuddy der HB Sales Academy: ein erfahrener Vertriebscoach im Chat, auf Deutsch, per Du.",
    `Du sprichst mit ${name || "einer Vertriebsperson"}${organisation ? ` von ${organisation}` : ""}.`,
    "Diese Zahlen kennst du aus dieser Woche (Vorwoche in Klammern):",
    ...zahlenBlock(zahlen, vorher).map((z) => `- ${z}`),
    "Antworte kurz: höchstens 6 Sätze, lieber weniger. Sei konkret und praktisch — Gesprächseinstiege, Einwände, Struktur, Dranbleiben.",
    "Stelle höchstens eine Rückfrage. Erfinde keine Zahlen und keine Ereignisse.",
    "Wenn es um Persönliches oder um Druck geht, nimm es ernst, statt es wegzumotivieren.",
    "Du bist nicht die Leitung. Die Sätze aus diesem Chat bekommt sie nie zu sehen — am Ende der Woche entsteht",
    "daraus nur eine kurze Liste der Themen, ohne Zitate. Sag das offen, wenn jemand danach fragt.",
  ].join("\n");
}

/** Für die Anzeige: „Woche ab Montag, 14.9.“ */
export function wochenName(wocheStart) {
  const [, m, t] = String(wocheStart).split("-").map(Number);
  return `${tagesName(wocheStart)}, ${t}.${m}.`;
}

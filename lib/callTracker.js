// Reine Logik des Call Trackers (Datumsbereiche, lokale Speicherung,
// Auswertung) — bewusst ohne React/DOM, damit die Seite selbst nur noch
// Darstellung ist.
//
// Historie: der Call Tracker war früher eine eigenständige HTML-Datei in
// public/tools/, die in einem iframe lief. Dadurch kannte er das Design der
// Academy nicht (eigene Farben, eigene Schrift, kein Hell/Dunkel) und jede
// Neuerung musste doppelt gebaut werden. Er ist jetzt eine normale Seite der
// App — die Speicher-Schlüssel sind bewusst UNVERÄNDERT geblieben, damit
// bereits erfasste Tage erhalten bleiben.

import { meldeFehler } from "./errorBus.js";
import { startOfWeek, endOfWeek, tagesSchluessel } from "./dateRange.js";

export const FIELDS = [
  { key: "anwahlen", label: "Anwahlen", kind: "neutral" },
  { key: "erreicht", label: "Ans Telefon gegangen", kind: "neutral" },
  { key: "nicht", label: "Nicht erreicht", kind: "neutral" },
  // WEN MAN ZUERST am Telefon hatte — jeder erreichte Anruf zählt genau
  // einmal. "Zuerst" steht ausdrücklich dabei, weil man nach einer
  // Weiterleitung beide gesprochen hat: ohne das Wort liest sich
  // "Geschäftsführer" wie "mit dem Chef gesprochen" und die Zahl wirkt zu
  // niedrig. Wie oft jemand tatsächlich bei der Entscheidung landet, ist
  // eine abgeleitete Zahl (entscheider + weitergeleitet), keine dritte
  // Buchung — sonst wäre die Summe grösser als "erreicht".
  { key: "gatekeeper", label: "Zuerst: Vorzimmer", kind: "neutral" },
  { key: "entscheider", label: "Zuerst: Entscheider", kind: "neutral" },
  // Am Vorzimmer vorbei: zählt nur bei Gatekeeper-Gesprächen.
  { key: "weitergeleitet", label: "Durchgestellt", kind: "positive" },
  { key: "termin", label: "Terminiert", kind: "positive" },
  { key: "negativ", label: "Negative Anrufe", kind: "negative" },
];

const KEY_PREFIX = "callstats:";
const SCHRITT_KEY = "callstep";

// Schritte, in denen ein Anruf ANGEFANGEN, aber noch nicht abgeschlossen ist.
//
// Genau hier entstand die Lücke: "Erreicht" war gezählt, das Ergebnis nie.
// Wer den Reiter wechselt oder das Fenster schliesst, liess einen halben
// Anruf zurück, und in der Auswertung stand ein grauer Rest, den niemand
// erklären konnte.
//
// Deshalb wird der Schritt gespeichert. Beim nächsten Öffnen fragt der
// Assistent genau dort weiter — die Zahl vervollständigt sich selbst,
// statt dass jemand raten muss.
export const OFFENE_SCHRITTE = ["outcome", "wen", "durchgestellt", "callResult", "reason", "booking", "leadForm"];

export function istOffenerAnruf(schritt) {
  return OFFENE_SCHRITTE.includes(schritt);
}

export function merkeSchritt(prefix, schritt) {
  try {
    if (istOffenerAnruf(schritt)) localStorage.setItem(prefix + SCHRITT_KEY, schritt);
    else localStorage.removeItem(prefix + SCHRITT_KEY);
  } catch (e) { /* privates Fenster: dann eben ohne Wiederaufnahme */ }
}

export function offenerSchritt(prefix) {
  try {
    const gespeichert = localStorage.getItem(prefix + SCHRITT_KEY);
    return istOffenerAnruf(gespeichert) ? gespeichert : null;
  } catch (e) { return null; }
}

// --- Anruf-Verlauf ---------------------------------------------------------
//
// Je Anruf wird festgehalten, WAS er gebucht hat. Damit nimmt der
// Minus-Knopf bei den Anwahlen den ganzen Anruf zurück und nicht nur die
// eine Zahl (siehe lib/anrufKorrektur.js).
//
// Ein neuer Anruf beginnt mit der Anwahl — alles danach gehört zu ihm, bis
// die nächste Anwahl startet. Deshalb braucht es kein "Anruf beenden": das
// nächste "Anwahl starten" ist das Ende des vorherigen.
const VERLAUF_KEY = "callcalls";

// Nur die letzten Anrufe eines Tages: korrigiert wird am Ende der Liste,
// weiter zurück greift ohnehin das Einregeln. Ohne Grenze wächst der
// Speicher an einem langen Telefontag unnötig.
const VERLAUF_MAX = 100;

function verlaufSchluessel(prefix, tag) { return `${prefix}${tag}:${VERLAUF_KEY}`; }

function leseVerlauf(prefix, tag) {
  try {
    const roh = localStorage.getItem(verlaufSchluessel(prefix, tag));
    const liste = roh ? JSON.parse(roh) : [];
    return Array.isArray(liste) ? liste : [];
  } catch (e) { return []; }
}

function schreibeVerlauf(prefix, tag, liste) {
  try {
    localStorage.setItem(verlaufSchluessel(prefix, tag), JSON.stringify(liste.slice(-VERLAUF_MAX)));
  } catch (e) { /* voller oder gesperrter Speicher: dann eben ohne Verlauf */ }
}

/**
 * Eine Buchung dem laufenden Anruf zuschreiben.
 * "anwahlen" beginnt einen neuen Anruf, alles andere ergänzt den letzten.
 */
export function merkeBuchung(prefix, tag, feld, grund = null) {
  const liste = leseVerlauf(prefix, tag);
  if (feld === "anwahlen" || liste.length === 0) {
    liste.push({ counts: { [feld]: 1 }, reasons: grund ? { [grund]: 1 } : {} });
  } else {
    const letzter = liste[liste.length - 1];
    letzter.counts[feld] = (letzter.counts[feld] || 0) + 1;
    if (grund) letzter.reasons[grund] = (letzter.reasons[grund] || 0) + 1;
  }
  schreibeVerlauf(prefix, tag, liste);
}

/** Den letzten Anruf herausnehmen — null, wenn nichts (mehr) da ist. */
export function nimmLetztenAnruf(prefix, tag) {
  const liste = leseVerlauf(prefix, tag);
  if (!liste.length) return null;
  const letzter = liste.pop();
  schreibeVerlauf(prefix, tag, liste);
  return letzter;
}

/** Verlauf eines Tages verwerfen — beim Zurücksetzen des Tages. */
export function leereVerlauf(prefix, tag) {
  try { localStorage.removeItem(verlaufSchluessel(prefix, tag)); } catch (e) { /* egal */ }
}

// Zähler sind pro angemeldeter Person getrennt, falls sich mehrere ein
// Gerät teilen. Schlüsselformat identisch zur früheren HTML-Fassung.
export function storagePrefix(userId) {
  return userId ? `hb_ct_${userId}_` : "hb_ct_";
}

function pad2(n) { return String(n).padStart(2, "0"); }
// Tagesschlüssel nach der Zeit des Geräts — so, wie die Person ihren
// Arbeitstag erlebt.
//
// Entscheidend ist nicht, WELCHE Zeitzone gilt, sondern dass der lokale
// Schlüssel und die Zeile in call_log_days dieselbe benutzen. Der Server
// nahm bisher UTC: zwischen Mitternacht und 2 Uhr deutscher Zeit ist das ein
// anderer Tag, und die ersten Anrufe der Nacht landeten in der Zeile des
// VORTAGS — mit den frisch bei null begonnenen Zählern. Ein Tag mit 120
// Anwahlen konnte so auf 1 zurückfallen. Deshalb schreibt der Call Tracker
// jetzt genau diesen Schlüssel auch auf den Server (siehe
// pages/call-tracker.js).
export function dateKeyOf(d) { return tagesSchluessel(d); }
export function dayKey(d = new Date()) { return KEY_PREFIX + dateKeyOf(d); }

// Datums-Bereiche liegen zentral in lib/dateRange.js, damit "Woche" hier und
// bei den Termine-Filtern dasselbe bedeutet. Weiterhin von hier exportiert,
// damit die bestehenden Aufrufe unverändert bleiben.
export { startOfWeek, endOfWeek, startOfMonth, endOfMonth } from "./dateRange.js";

export function zeroCounts() { const o = {}; FIELDS.forEach((f) => { o[f.key] = 0; }); return o; }
export function zeroReasons(reasons) { const o = {}; reasons.forEach((r) => { o[r.key] = 0; }); return o; }

function fmtShort(d) { return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" }); }
export function todayFullLabel() {
  return new Date().toLocaleDateString("de-DE", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
}
export function weekLabel() {
  const now = new Date();
  return `Woche: ${fmtShort(startOfWeek(now))} – ${fmtShort(endOfWeek(now))}`;
}
export function monthLabel() {
  return new Date().toLocaleDateString("de-DE", { month: "long", year: "numeric" });
}

export function loadDay(prefix, key, reasons) {
  const counts = zeroCounts();
  const reasonCounts = zeroReasons(reasons);
  try {
    const raw = localStorage.getItem(prefix + key);
    if (!raw) return { counts, reasons: reasonCounts };
    const saved = JSON.parse(raw);
    // Ältere Einträge speicherten die Zähler noch direkt (ohne counts-Ebene).
    const savedCounts = saved.counts || saved;
    FIELDS.forEach((f) => { if (typeof savedCounts[f.key] === "number") counts[f.key] = savedCounts[f.key]; });
    if (saved.reasons) {
      reasons.forEach((r) => { if (typeof saved.reasons[r.key] === "number") reasonCounts[r.key] = saved.reasons[r.key]; });
    }
  } catch (e) { /* Tag nicht lesbar — bei 0 anfangen */ }
  return { counts, reasons: reasonCounts };
}

export function saveDay(prefix, key, counts, reasonCounts) {
  try {
    localStorage.setItem(prefix + key, JSON.stringify({ counts, reasons: reasonCounts }));
  } catch (e) {
    // z.B. privates Fenster oder voller Speicher. Zählen läuft in dieser
    // Sitzung weiter, ist aber beim nächsten Laden weg — das muss man wissen,
    // bevor man einen ganzen Vormittag umsonst zählt.
    meldeFehler("Deine Zählerstände können auf diesem Gerät nicht gespeichert werden — beim Neuladen der Seite gehen sie verloren.", e);
  }
}

// Summiert alle lokal gespeicherten Tage innerhalb eines Zeitraums.
//
// Die Auswertungen der Academy lesen inzwischen vom Server (Statistiken im
// Call Tracker) — diese Funktion bleibt als Notnagel für den lokalen
// Bestand: was ein Gerät offline gezählt hat, liegt weiterhin nur hier.
export function aggregateRange(prefix, rangeStart, rangeEnd, reasons) {
  const agg = { counts: zeroCounts(), reasons: zeroReasons(reasons) };
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const fullKey = localStorage.key(i);
      if (!fullKey || !fullKey.startsWith(prefix + KEY_PREFIX)) continue;
      const datePart = fullKey.slice((prefix + KEY_PREFIX).length);
      const d = new Date(datePart + "T12:00:00");
      if (isNaN(d) || d < rangeStart || d > rangeEnd) continue;
      const parsed = JSON.parse(localStorage.getItem(fullKey));
      const c = parsed.counts || parsed;
      const r = parsed.reasons || {};
      FIELDS.forEach((f) => { agg.counts[f.key] += typeof c[f.key] === "number" ? c[f.key] : 0; });
      reasons.forEach((rr) => { agg.reasons[rr.key] += typeof r[rr.key] === "number" ? r[rr.key] : 0; });
    }
  } catch (e) { /* unlesbare Einträge überspringen */ }
  return agg;
}

// Alle lokal gespeicherten Tage dieses Kontos — für das Nachtragen zum
// Server. Ohne Zeitraum: es geht gerade darum, was NICHT angekommen ist.
export function alleGespeichertenTage(prefix, reasons) {
  const tage = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const fullKey = localStorage.key(i);
      if (!fullKey || !fullKey.startsWith(prefix + KEY_PREFIX)) continue;
      const tag = fullKey.slice((prefix + KEY_PREFIX).length);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(tag)) continue;
      const parsed = JSON.parse(localStorage.getItem(fullKey));
      const c = parsed.counts || parsed;
      const r = parsed.reasons || {};
      const counts = zeroCounts();
      FIELDS.forEach((f) => { counts[f.key] = typeof c[f.key] === "number" ? c[f.key] : 0; });
      const reasonCounts = zeroReasons(reasons || []);
      (reasons || []).forEach((rr) => { reasonCounts[rr.key] = typeof r[rr.key] === "number" ? r[rr.key] : 0; });
      tage.push({ tag, counts, reasons: reasonCounts });
    }
  } catch (e) { /* unlesbare Einträge überspringen */ }
  return tage.sort((a, b) => a.tag.localeCompare(b.tag));
}

// Beim Nachtragen gewinnt der höhere Wert, nicht der neuere.
//
// Grund: Auf dem Server kann bereits mehr stehen als auf diesem Gerät — etwa
// weil jemand zwischendurch am Rechner weitergezählt hat. Stumpfes
// Überschreiben würde diese Zahlen vernichten. Ein Zähler kann nur wachsen,
// also ist der grössere Wert immer der vollständigere.
export function zaehlerZusammenfuehren(lokal = {}, server = {}) {
  const zusammen = { ...server };
  Object.keys(lokal).forEach((k) => {
    const a = Number(lokal[k]) || 0;
    const b = Number(server[k]) || 0;
    zusammen[k] = Math.max(a, b);
  });
  return zusammen;
}

export function buildReport({ orgName, rangeLabel, counts, reasonCounts, reasons }) {
  const total = reasons.reduce((sum, r) => sum + (reasonCounts[r.key] || 0), 0);
  const lines = [
    `${orgName || "HB Sales Academy"} – Bericht (${rangeLabel})`,
    ``,
    `Anwahlen: ${counts.anwahlen}`,
    `Ans Telefon gegangen: ${counts.erreicht}`,
    `Nicht erreicht: ${counts.nicht}`,
    `Terminiert: ${counts.termin}`,
    `Negative Anrufe: ${counts.negativ}`,
  ];
  if (total > 0) {
    lines.push(``, `Einwand-Verteilung:`);
    [...reasons].sort((a, b) => (reasonCounts[b.key] || 0) - (reasonCounts[a.key] || 0)).forEach((r) => {
      const n = reasonCounts[r.key] || 0;
      lines.push(`  ${r.label}: ${n} (${Math.round((n / total) * 100)}%)`);
    });
  }
  return lines.join("\n");
}

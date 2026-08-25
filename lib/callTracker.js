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
  { key: "termin", label: "Terminiert", kind: "positive" },
  { key: "negativ", label: "Negative Anrufe", kind: "negative" },
];

const KEY_PREFIX = "callstats:";

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

// Summiert alle lokal gespeicherten Tage innerhalb eines Zeitraums
// (Wochen-/Monatsansicht). Rein lokal: Zahlen anderer Geräte sind hier
// bewusst nicht enthalten, dafür gibt es die Team-Ansicht.
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

// Dieselben Tage wie aggregateRange, aber EINZELN statt aufsummiert — für
// die Aufschlüsselung hinter einer Kachel ("woher kommen diese 47?") und
// für den Export.
export function tageImZeitraum(prefix, rangeStart, rangeEnd, reasons) {
  const tage = [];
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
      const counts = zeroCounts();
      FIELDS.forEach((f) => { counts[f.key] = typeof c[f.key] === "number" ? c[f.key] : 0; });
      const reasonCounts = zeroReasons(reasons);
      (reasons || []).forEach((rr) => { reasonCounts[rr.key] = typeof r[rr.key] === "number" ? r[rr.key] : 0; });
      tage.push({ tag: datePart, counts, reasons: reasonCounts });
    }
  } catch (e) { /* unlesbare Einträge überspringen */ }
  // Neueste zuerst: die letzten Tage interessieren am meisten.
  return tage.sort((a, b) => b.tag.localeCompare(a.tag));
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

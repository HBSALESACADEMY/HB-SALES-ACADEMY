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

import { meldeFehler } from "./errorBus";

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
export function dateKeyOf(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
export function dayKey(d = new Date()) { return KEY_PREFIX + dateKeyOf(d); }

export function startOfWeek(d) {
  const day = (d.getDay() + 6) % 7; // Montag = 0
  const monday = new Date(d);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(d.getDate() - day);
  return monday;
}
export function endOfWeek(d) {
  const monday = startOfWeek(d);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  return sunday;
}
export function startOfMonth(d) { const s = new Date(d.getFullYear(), d.getMonth(), 1); s.setHours(0, 0, 0, 0); return s; }
export function endOfMonth(d) { const e = new Date(d.getFullYear(), d.getMonth() + 1, 0); e.setHours(23, 59, 59, 999); return e; }

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

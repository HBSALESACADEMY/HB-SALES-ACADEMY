// Welcher Einwand kommt zu welcher Uhrzeit — und wann sich Anrufen lohnt.
//
// Zwei Dinge entscheiden über die Brauchbarkeit dieser Auswertung:
//
// 1. Die Uhrzeit muss die DEUTSCHE sein. Der Server läuft in UTC; ohne
//    Umrechnung stünde in der Auswertung 7 Uhr, wo um 9 telefoniert wurde,
//    und im Winter eine Stunde anders als im Sommer.
// 2. Eine Stunde mit drei Anrufen ist keine Erkenntnis. Deshalb nennt
//    besteStunde/schlechtesteStunde nur etwas, wenn genug zusammenkommt —
//    sonst liest jemand eine Zufallsspitze als Muster und legt seinen
//    Arbeitstag danach.

import { DEUTSCHE_ZONE } from "./terminzeit.js";

// Darunter ist eine Stunde nicht aussagekräftig genug, um sie als "beste"
// oder "schlechteste" zu benennen.
export const MINDESTENS_JE_STUNDE = 10;

/** Die Stunde (0–23) eines Zeitpunkts in deutscher Zeit. */
export function deutscheStunde(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const text = new Intl.DateTimeFormat("de-DE", {
    timeZone: DEUTSCHE_ZONE, hour: "2-digit", hour12: false,
  }).format(d);
  const stunde = parseInt(text, 10);
  return Number.isNaN(stunde) ? null : stunde % 24;
}

/** "9–10 Uhr" — als Spanne, weil eine Stunde ein Zeitraum ist. */
export function stundenText(stunde) {
  return `${String(stunde).padStart(2, "0")}–${String((stunde + 1) % 24).padStart(2, "0")} Uhr`;
}

/**
 * Das Raster: je Stunde, je Grund, wie oft.
 *
 * @param {Array} ereignisse Zeilen aus call_events
 * @param {Array} gruende    Kategorien der Organisation ({key, label})
 */
export function stundenRaster(ereignisse = [], gruende = []) {
  const stunden = new Map();
  const holen = (h) => {
    if (!stunden.has(h)) {
      stunden.set(h, { stunde: h, negativ: 0, termin: 0, gruende: {} });
    }
    return stunden.get(h);
  };

  ereignisse.forEach((e) => {
    const h = deutscheStunde(e.erfasst_at);
    if (h === null) return;
    const zeile = holen(h);
    if (e.art === "termin") { zeile.termin += 1; return; }
    if (e.art !== "negativ") return;
    zeile.negativ += 1;
    // Ein Grund, den die Organisation inzwischen umbenannt oder gelöscht
    // hat, verschwindet nicht: er zählt weiter, nur ohne schöne Bezeichnung.
    const key = e.grund || "ohne";
    zeile.gruende[key] = (zeile.gruende[key] || 0) + 1;
  });

  const liste = [...stunden.values()].sort((a, b) => a.stunde - b.stunde);
  return liste.map((z) => ({
    ...z,
    gesamt: z.negativ + z.termin,
    // Anteil der Termine an allem, was in dieser Stunde entschieden wurde.
    erfolgsquote: z.negativ + z.termin > 0 ? Math.round((z.termin / (z.negativ + z.termin)) * 100) : null,
    verteilung: gruende.map((g) => ({ key: g.key, label: g.label, wert: z.gruende[g.key] || 0 })),
  }));
}

/** Die Stunde mit der höchsten Terminquote — null, wenn zu dünn. */
export function besteStunde(raster = []) {
  const brauchbar = raster.filter((z) => z.gesamt >= MINDESTENS_JE_STUNDE);
  if (!brauchbar.length) return null;
  return brauchbar.reduce((a, b) => (b.erfolgsquote > a.erfolgsquote ? b : a));
}

/** Die Stunde mit der niedrigsten Terminquote — null, wenn zu dünn. */
export function schlechtesteStunde(raster = []) {
  const brauchbar = raster.filter((z) => z.gesamt >= MINDESTENS_JE_STUNDE);
  if (brauchbar.length < 2) return null;
  return brauchbar.reduce((a, b) => (b.erfolgsquote < a.erfolgsquote ? b : a));
}

/**
 * Wann ein einzelner Einwand seine Spitze hat.
 *
 * Gemessen am ANTEIL innerhalb der Stunde, nicht an der absoluten Zahl:
 * sonst hätte jeder Einwand seine Spitze dann, wenn am meisten telefoniert
 * wird — das sagt etwas über den Arbeitstag, nichts über den Einwand.
 */
export function spitzeJeGrund(raster = [], gruende = []) {
  return gruende.map((g) => {
    const gesamt = raster.reduce((s, z) => s + (z.gruende[g.key] || 0), 0);
    const brauchbar = raster.filter((z) => z.negativ >= 5);
    let spitze = null;
    if (gesamt > 0 && brauchbar.length) {
      spitze = brauchbar.reduce((a, b) => {
        const anteilA = (a.gruende[g.key] || 0) / a.negativ;
        const anteilB = (b.gruende[g.key] || 0) / b.negativ;
        return anteilB > anteilA ? b : a;
      });
      if (!(spitze.gruende[g.key] > 0)) spitze = null;
    }
    return {
      key: g.key,
      label: g.label,
      gesamt,
      stunde: spitze ? spitze.stunde : null,
      anteil: spitze ? Math.round(((spitze.gruende[g.key] || 0) / spitze.negativ) * 100) : null,
    };
  }).sort((a, b) => b.gesamt - a.gesamt);
}

// Zeiträume für Team-Ziele.
//
// Früher galt jedes Ziel fest für die laufende Woche (team_goals.week_start,
// montags neu). Jetzt bestimmt die Teamleitung selbst, bis wann ein Ziel
// läuft — Woche, Monat, Quartal oder ein frei gewählter Zeitraum.
//
// Gerechnet wird durchgängig mit Datumszeichenketten "JJJJ-MM-TT" und über
// UTC-Bausteine (siehe lib/woche.js): Browser und Server müssen zum selben
// Ergebnis kommen, sonst sucht der Server einen anderen Zeitraum als der
// Browser geschrieben hat.
import { berlinHeute, wochenStartTag, tagPlus } from "./woche.js";

export const ZEITRAEUME = [
  { key: "woche", label: "Diese Woche" },
  { key: "monat", label: "Dieser Monat" },
  { key: "quartal", label: "Dieses Quartal" },
  { key: "frei", label: "Eigener Zeitraum" },
];

export function zeitraumFuer(key, jetzt = new Date()) {
  const heute = berlinHeute(jetzt);
  const [j, m] = heute.split("-").map(Number);
  const zweistellig = (n) => String(n).padStart(2, "0");
  const letzterTag = (jahr, monat) => new Date(Date.UTC(jahr, monat, 0)).getUTCDate();

  if (key === "monat") {
    return { von: `${j}-${zweistellig(m)}-01`, bis: `${j}-${zweistellig(m)}-${letzterTag(j, m)}` };
  }
  if (key === "quartal") {
    const ersterMonat = Math.floor((m - 1) / 3) * 3 + 1;
    const letzterMonat = ersterMonat + 2;
    return {
      von: `${j}-${zweistellig(ersterMonat)}-01`,
      bis: `${j}-${zweistellig(letzterMonat)}-${letzterTag(j, letzterMonat)}`,
    };
  }
  // Standard: die laufende Woche, Montag bis Sonntag.
  const montag = wochenStartTag(jetzt);
  return { von: montag, bis: tagPlus(montag, 6) };
}

export function zeitraumLabel(von, bis) {
  const fmt = (t) => new Date(`${t}T12:00:00Z`).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" });
  return `${fmt(von)} – ${fmt(bis)}`;
}

// Läuft das Ziel gerade, oder ist es vorbei?
export function istAbgelaufen(ziel, jetzt = new Date()) {
  const heute = berlinHeute(jetzt);
  return !!(ziel?.ends_on && ziel.ends_on < heute);
}

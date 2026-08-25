import { berlinHeute, tagPlus } from "./woche.js";

// Zeiträume für Auswertungen — an einer Stelle, damit "Quartal" überall
// dasselbe heisst.
//
// Gerechnet wird in deutschen Kalendertagen (siehe lib/woche.js): "vor 30
// Tagen" über Millisekunden zu rechnen verschiebt je nach Uhrzeit und
// Sommerzeit den Anfang.
export const ZEITRAEUME = [
  ["heute", "Heute"],
  ["woche", "7 Tage"],
  ["monat", "30 Tage"],
  ["quartal", "Quartal"],
  ["eigen", "Eigener Zeitraum"],
];

// Erster Tag des Quartals, in dem dieser Tag liegt.
export function quartalsStart(tag) {
  const [jahr, monat] = String(tag).split("-").map(Number);
  if (!jahr || !monat) return tag;
  const ersterMonat = Math.floor((monat - 1) / 3) * 3 + 1;
  return `${jahr}-${String(ersterMonat).padStart(2, "0")}-01`;
}

export function quartalsName(tag) {
  const [jahr, monat] = String(tag).split("-").map(Number);
  if (!jahr || !monat) return "";
  return `Q${Math.floor((monat - 1) / 3) + 1} ${jahr}`;
}

// Liefert immer ein gültiges Paar. Ein eigener Zeitraum ohne Angaben oder
// mit vertauschten Grenzen darf nicht dazu führen, dass die Auswertung leer
// bleibt und niemand versteht warum.
export function zeitraumGrenzen(art, { heute = berlinHeute(), von, bis } = {}) {
  if (art === "heute") return { von: heute, bis: heute };
  if (art === "monat") return { von: tagPlus(heute, -29), bis: heute };
  if (art === "quartal") return { von: quartalsStart(heute), bis: heute };
  if (art === "eigen") {
    const a = von || bis || heute;
    const b = bis || von || heute;
    // Vertauscht eingegeben: still drehen statt nichts anzuzeigen.
    return a <= b ? { von: a, bis: b } : { von: b, bis: a };
  }
  return { von: tagPlus(heute, -6), bis: heute };
}

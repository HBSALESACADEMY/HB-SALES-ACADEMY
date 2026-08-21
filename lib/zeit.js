// Zeitangaben in der Zeitzone, die die Person eingestellt hat.
//
// Vorher galt überall die Zeitzone des GERÄTS. Steht die falsch, zeigt die
// Academy Termine zur falschen Uhrzeit — und man sucht den Fehler in den
// Daten statt in der Systemeinstellung.
//
// Die Auswahl liegt in profiles.zeitzone (migration_107) und wird beim Laden
// in den Browser gespiegelt: Formatieren muss ohne Warten funktionieren,
// mitten im Zeichnen einer Liste kann man keine Abfrage abwarten.
import { terminMitZusatz } from "./terminzeit.js";

const SCHLUESSEL = "hb_zeitzone";

export const ZEITZONEN = [
  { key: "", label: "Automatisch (Gerät)" },
  { key: "Europe/Berlin", label: "Deutschland, Österreich (Berlin)" },
  { key: "Europe/Zurich", label: "Schweiz (Zürich)" },
  { key: "Europe/London", label: "Grossbritannien (London)" },
  { key: "Europe/Athens", label: "Griechenland, Türkei (Athen)" },
  { key: "Europe/Moscow", label: "Moskau" },
  { key: "America/New_York", label: "USA Ostküste (New York)" },
  { key: "America/Los_Angeles", label: "USA Westküste (Los Angeles)" },
  { key: "Asia/Dubai", label: "Dubai" },
  { key: "Asia/Singapore", label: "Singapur" },
];

export function merkeZeitzone(wert) {
  try {
    if (wert) localStorage.setItem(SCHLUESSEL, wert);
    else localStorage.removeItem(SCHLUESSEL);
  } catch (e) { /* privates Fenster ohne Speicher — dann eben automatisch */ }
}

export function getZeitzone() {
  try {
    return localStorage.getItem(SCHLUESSEL) || undefined;
  } catch (e) {
    return undefined;
  }
}

// undefined als timeZone bedeutet für Intl: die des Geräts. Genau das soll
// "Automatisch" tun, deshalb wird der Wert einfach durchgereicht.
export function formatiere(datum, optionen = {}) {
  if (!datum) return "";
  const d = datum instanceof Date ? datum : new Date(datum);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("de-DE", { timeZone: getZeitzone(), ...optionen });
}

export function formatiereDatum(datum, optionen = {}) {
  if (!datum) return "";
  const d = datum instanceof Date ? datum : new Date(datum);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("de-DE", { timeZone: getZeitzone(), ...optionen });
}

export function formatiereUhrzeit(datum, optionen = { hour: "2-digit", minute: "2-digit" }) {
  if (!datum) return "";
  const d = datum instanceof Date ? datum : new Date(datum);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("de-DE", { timeZone: getZeitzone(), ...optionen });
}

// Termin-Zeitpunkt nach der Regel: deutsche Zeit ist maßgeblich, die eigene
// Ortszeit erscheint nur, wenn sie abweicht (siehe lib/terminzeit.js).
//
// "Automatisch" heisst hier die Zeitzone des Geräts — die muss aufgelöst
// werden, sonst könnte terminMitZusatz() nicht vergleichen.
export function terminAnzeige(iso) {
  let zone = getZeitzone();
  if (!zone) {
    try { zone = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (e) { zone = null; }
  }
  return terminMitZusatz(iso, zone);
}

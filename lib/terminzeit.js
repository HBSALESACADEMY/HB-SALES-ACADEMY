// Termin-Zeiten einheitlich darstellen.
//
// Die deutsche Uhrzeit ist die maßgebliche — sie steht immer vorn. Wer in
// einer anderen Zeitzone sitzt, bekommt seine eigene als Zusatz dahinter;
// wer in Deutschland sitzt, sieht nur die eine Angabe.
//
// Anlass: Auf dem Server (Vercel läuft in UTC) wurden Zeiten ohne Zeitzone
// formatiert. Ein Termin um 14:00 stand dadurch in Telegram und in den
// E-Mails als "12:00" — zwei Stunden zu früh, jeden Sommer.
export const DEUTSCHE_ZONE = "Europe/Berlin";

const STIL = { dateStyle: "medium", timeStyle: "short" };

export function inZone(iso, zone, optionen = STIL) {
  if (!iso) return "";
  const d = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("de-DE", { timeZone: zone, ...optionen });
}

// Die maßgebliche Angabe: immer deutsche Zeit, unabhängig davon, wo der
// Server oder der Browser steht.
export function deutscheZeit(iso, optionen = STIL) {
  return inZone(iso, DEUTSCHE_ZONE, optionen);
}

// Nur die Uhrzeit, für den Zusatz in Klammern.
export function nurUhrzeit(iso, zone) {
  return inZone(iso, zone, { hour: "2-digit", minute: "2-digit" });
}

// Deutsche Zeit plus — falls abweichend — die Ortszeit der betrachtenden
// Person. Verglichen wird die DARSTELLUNG, nicht der Name der Zeitzone:
// Wien und Berlin heissen verschieden, zeigen aber dieselbe Uhrzeit, und
// dann wäre ein Zusatz nur Lärm.
export function terminMitZusatz(iso, zone) {
  const haupt = deutscheZeit(iso);
  if (!haupt || !zone || zone === DEUTSCHE_ZONE) return { haupt, zusatz: null };
  const dort = nurUhrzeit(iso, zone);
  const hier = nurUhrzeit(iso, DEUTSCHE_ZONE);
  return { haupt, zusatz: dort && dort !== hier ? dort : null };
}

// Fertiger Text für Anzeige, Mail und Nachricht.
export function terminText(iso, zone) {
  const { haupt, zusatz } = terminMitZusatz(iso, zone);
  if (!haupt) return "";
  return zusatz ? `${haupt} Uhr (bei dir ${zusatz})` : `${haupt} Uhr`;
}

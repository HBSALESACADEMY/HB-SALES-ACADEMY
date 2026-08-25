// Wann die Academy meldet "diese Person ist gerade da".
//
// Anwesenheit soll heissen: jemand TUT gerade etwas. Ein Tab, der seit heute
// Morgen offen liegt, ist keine Anwesenheit — sonst stünde dauerhaft die
// halbe Firma in der Liste und die Anzeige wäre wertlos.
//
// Deshalb zählt jede Berührung: tippen, klicken, wischen, Tastatur. Danach
// gilt man für eine Weile als da, und erst wenn nichts mehr kommt, fällt man
// still heraus.
export const SENDE_ABSTAND_MS = 2 * 60 * 1000;   // höchstens alle zwei Minuten schreiben
export const RUHE_MS = 5 * 60 * 1000;            // so lange gilt man nach einer Berührung als aktiv

export function sollLebenszeichenSenden({ sichtbar, jetzt, letztesSenden, letzteInteraktion }) {
  // Ein unsichtbarer Tab meldet nie — auch nicht kurz nach einer Berührung.
  if (!sichtbar) return false;
  // Nicht öfter als nötig: sonst entsteht bei jedem Klick eine Schreiblast.
  if (letztesSenden && jetzt - letztesSenden < SENDE_ABSTAND_MS) return false;
  // Ohne jede Berührung (frisch geöffnet) einmal melden — man ist ja da.
  if (!letzteInteraktion) return true;
  return jetzt - letzteInteraktion <= RUHE_MS;
}

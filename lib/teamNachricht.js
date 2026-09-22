// Eine kurze Nachricht der Leitung an das eigene Team, über den Buddy.
//
// Warum überhaupt: Wer etwas ans Team durchgeben will, hat sonst nur den
// Umweg über eine Gruppe oder über WhatsApp. Der Buddy erreicht genau die
// Personen, die ihn ohnehin benutzen.
//
// Drei Dinge sind dabei nicht verhandelbar:
//
//   1. Die Nachricht trägt den Namen der Person, die sie geschrieben hat.
//      Eine Nachricht, die nur "von der Academy" kommt, wäre eine Stimme
//      ohne Absender — damit könnte man alles behaupten.
//   2. Sie geht ausschliesslich an die eigene Organisation. Der Weg dorthin
//      ist die AKTIVE Organisation der Leitung, nicht ihre Heimat.
//   3. Es steht dabei, dass eine Antwort im Chat nicht bei der Leitung
//      landet. Der Buddy versteht eine Antwort sonst als Eintrag für die
//      Academy, und das wäre ein Missverständnis mit Folgen.
//
// Die Testroute für Kanäle (pages/api/admin/telegram-test.js) nimmt bewusst
// keinen freien Text an. Diese hier muss es — deshalb sind Länge, Empfänger
// und Absender eng gefasst.
//
// Hier steht nur das Prüfen und der Text, ohne Datenbank und ohne Telegram:
// Die Einstellungen-Seite braucht die Höchstlänge, und sie darf dafür
// keinen Server-Code in den Browser ziehen. Der Versand liegt in
// lib/teamNachrichtVersand.js.

export const MIN_LAENGE = 3;
// Telegram kann 4096 Zeichen. Kürzer ist hier Absicht: Was länger ist,
// gehört in eine Schulung oder eine Mail, nicht in eine Kurznachricht.
export const MAX_LAENGE = 800;

/** Eine eingegebene Nachricht prüfen: { text } oder { fehler }. */
export function leseNachricht(roh) {
  const text = String(roh ?? "").replace(/\r\n/g, "\n").trim();
  if (!text) return { fehler: "Es steht noch keine Nachricht da." };
  if (text.length < MIN_LAENGE) return { fehler: "Das ist zu kurz für eine Nachricht." };
  if (text.length > MAX_LAENGE) {
    return { fehler: `Zu lang: ${text.length} Zeichen. Höchstens ${MAX_LAENGE} — für mehr ist eine Mail der bessere Weg.` };
  }
  return { text };
}

/**
 * Die Nachricht, wie sie in Telegram ankommt.
 *
 * Der Name steht oben, der Hinweis unten. Beides fügt die Academy hinzu —
 * die Leitung kann es nicht weglassen, und genau darum geht es.
 */
export function nachrichtText({ text = "", von = "" } = {}) {
  const absender = String(von || "").trim() || "der Vertriebsleitung";
  return [
    `📣 Nachricht von ${absender}`,
    "",
    text,
    "",
    `— Über die Academy verschickt. Eine Antwort hier landet beim Buddy und nicht bei ${absender}.`,
  ].join("\n");
}

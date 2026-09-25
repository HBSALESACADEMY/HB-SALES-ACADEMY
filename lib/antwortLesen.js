// Die Antwort des Servers lesen — und sagen, was los ist, wenn sie keine ist.
//
// Am 25.09.2026 kam beim Betreiber diese Störmeldung an:
//
//   Wo: Call Tracker Tagesrangliste
//   Meldung: The string did not match the expected pattern.
//   Bei: Ernestine Petrick (Volk Work)
//
// So formuliert Safari einen JSON-Fehler. Die Meldung erklärt nichts: nicht,
// welche Anfrage es war, nicht, was der Server geantwortet hat, und schon gar
// nicht, was zu tun ist. In Chrome hiesse dieselbe Sache "Unexpected token
// '<'", auf dem iPhone manchmal "JSON Parse error" — drei Texte für ein
// Problem, und keiner davon ist eine Information.
//
// Der Grund ist immer derselbe: Der Server hat kein JSON geschickt. Entweder
// eine Fehlerseite (504 bei einem Timeout, 502, eine Wartungsseite), oder die
// Verbindung brach mitten in der Antwort ab — auf einem Handy zwischen zwei
// Funkzellen der Normalfall.
//
// Diese Datei macht daraus einen Satz, mit dem sich etwas anfangen lässt.
// Reine Logik, ohne fetch: So lässt sich jeder Fall prüfen, ohne einen Server
// zu brauchen.

/** Woran man eine HTML-Fehlerseite erkennt. */
function istSeite(text) {
  const anfang = text.trimStart().slice(0, 40).toLowerCase();
  return anfang.startsWith("<");
}

/**
 * Den Text einer Antwort zu Daten machen.
 *
 * @param text    Der rohe Text der Antwort
 * @param status  HTTP-Status
 * @param pfad    Die angefragte Adresse — gehört in die Meldung, sonst
 *                weiss niemand, WELCHE Anfrage geplatzt ist
 * @returns { daten } oder { fehler: "Satz", netz: boolean }
 *
 * "netz" heisst: Das Problem liegt an der Verbindung des Geräts, nicht an
 * der Academy. Solche Fälle gehören der betroffenen Person gesagt und nicht
 * dem Betreiber gemeldet — er kann das Funknetz im Zug nicht reparieren.
 */
export function liesAntwort(text, status, pfad = "") {
  const roh = String(text ?? "");
  const wo = pfad ? ` auf ${pfad}` : "";

  if (!roh.trim()) {
    // Leer und trotzdem "erfolgreich": Das ist der Abbruch mitten in der
    // Übertragung, praktisch immer ein Verbindungsproblem des Geräts.
    if (status >= 200 && status < 300) {
      return { fehler: `Die Verbindung brach ab, bevor die Antwort${wo} vollständig war.`, netz: true };
    }
    return { fehler: `Der Server antwortete${wo} mit Status ${status}, ohne Inhalt.`, netz: false };
  }

  try {
    return { daten: JSON.parse(roh) };
  } catch {
    // Der Anfang des Textes gehört NICHT in die Meldung: Auf Fehlerseiten
    // stehen gelegentlich Kennungen der Anfrage oder interne Adressen, und
    // die haben in einer Telegram-Gruppe nichts zu suchen.
    const art = istSeite(roh) ? "eine Fehlerseite" : "keine verwertbaren Daten";
    return {
      fehler: `Der Server schickte${wo} ${art} statt Daten (Status ${status}).`,
      // 502, 503, 504 sind Durchgangsprobleme: Vercel hat abgeschnitten oder
      // war kurz nicht erreichbar. Das passiert und heilt von selbst.
      netz: status === 502 || status === 503 || status === 504,
    };
  }
}

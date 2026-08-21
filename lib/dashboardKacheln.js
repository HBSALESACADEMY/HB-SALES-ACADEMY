// Die Kacheln des Schnellzugriffs — an EINER Stelle.
//
// Vorher stand die Liste zweimal da: einmal im Dashboard (mit Symbolen,
// Zielen und Zählern) und einmal in den Einstellungen (nur Beschriftungen).
// Sie liefen auseinander — die Verwaltungs-Kacheln kannte nur das Dashboard,
// und ein neuer Punkt wie der Kalender fehlte in beiden.
//
// standard: false heisst "gibt es, ist aber nicht von Anfang an dabei".
// Wer sie will, blendet sie ein — sonst wächst der Schnellzugriff mit jeder
// neuen Seite weiter zu.
export const DASHBOARD_KACHELN = [
  { key: "messages", label: "Nachrichten", icon: "chat", route: "/messages", standard: true },
  { key: "members", label: "Mitglieder", icon: "users", route: "/members", standard: true },
  { key: "community", label: "Community", icon: "users", route: "/community", standard: true },
  { key: "kalender", label: "Kalender", icon: "calendar", route: "/kalender", standard: true },
  { key: "daily-challenge", label: "Tages-Challenge", icon: "flame", route: "/daily-challenge", standard: true },
  { key: "duel", label: "Quiz-Duell", icon: "target", route: "/duel", standard: true },
  { key: "flashcards", label: "Flashcards", icon: "library", route: "/flashcards", standard: true },
  { key: "simulator", label: "Simulator", icon: "chat", route: "/simulator", standard: true },
  { key: "leaderboard", label: "Rangliste", icon: "award", route: "/leaderboard", standard: true },
  { key: "termine", label: "Termine", icon: "calendar", route: "/termine", standard: false },
  { key: "call-tracker", label: "Call Tracker", icon: "phone", route: "/call-tracker", standard: false },
  { key: "kunden", label: "Erfolge und Abschlüsse", icon: "award", route: "/kunden", standard: false },
  { key: "knowledge", label: "Wissen", icon: "library", route: "/knowledge", standard: false },
  { key: "recordings", label: "Aufnahmen", icon: "mic", route: "/recordings", standard: false },
  // Nur für Führungsrollen — für alle anderen führt der Weg ins Leere.
  { key: "admin", label: "Freigaben", icon: "lock", route: "/admin", standard: true, nurFuehrung: true },
  { key: "admin-suggestions", label: "Wissens-Vorschläge", icon: "lock", route: "/admin/suggestions", standard: true, nurFuehrung: true },
];

// Welche Kacheln jemand sieht: eigene Auswahl vor Vorgabe, eigene
// Reihenfolge vor Listenreihenfolge.
//
// prefs.sichtbar (Liste von Schlüsseln) ist die neue, ausdrückliche Auswahl.
// prefs.hidden bleibt gültig, damit ausgeblendete Kacheln nach dieser
// Änderung nicht wieder auftauchen — das wäre gegen den ausdrücklichen
// Willen der Person.
export function sichtbareKacheln(prefs = {}, istFuehrung = false) {
  const versteckt = new Set(prefs?.hidden || []);
  const gewaehlt = Array.isArray(prefs?.sichtbar) ? new Set(prefs.sichtbar) : null;
  const order = prefs?.order || [];

  const gefiltert = DASHBOARD_KACHELN.filter((k) => {
    if (k.nurFuehrung && !istFuehrung) return false;
    if (versteckt.has(k.key)) return false;
    if (gewaehlt) return gewaehlt.has(k.key);
    return k.standard;
  });

  return gefiltert.sort((a, b) => {
    const ia = order.indexOf(a.key), ib = order.indexOf(b.key);
    if (ia === -1 && ib === -1) return 0;
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
}

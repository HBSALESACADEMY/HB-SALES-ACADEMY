// Kuratierte Vertriebs-/Verkaufspsychologie-Sprüche für die Sidebar.
// Wechselt einmal pro Kalendertag, für alle im Team gleich (wie die Tages-Challenge).

export const SALES_QUOTES = [
  { text: "Menschen kaufen nicht, was du tust, sondern warum du es tust.", author: "Simon Sinek" },
  { text: "Verkaufen heißt nicht überreden, sondern verstehen.", author: null },
  { text: "Der beste Verkäufer hört doppelt so viel, wie er redet.", author: null },
  { text: "Einwände sind keine Ablehnung — sie sind eine Bitte um mehr Informationen.", author: null },
  { text: "Menschen erinnern sich nicht an dein Angebot, sondern daran, wie du sie behandelt hast.", author: null },
  { text: "Vertrauen ist die Währung, mit der jeder Abschluss bezahlt wird.", author: null },
  { text: "Fragen öffnen Türen, die Argumente niemals öffnen könnten.", author: null },
  { text: "Ein Nein heute ist selten ein Nein für immer.", author: null },
  { text: "Der Abschluss beginnt beim ersten Wort des Gesprächs.", author: null },
  { text: "Wer zuhört, verkauft mehr als wer überzeugt.", author: null },
  { text: "Kunden kaufen Ergebnisse, keine Produkte.", author: null },
  { text: "Die beste Zeit für den nächsten Anruf ist gleich nach dem letzten.", author: null },
  { text: "Erfolg im Vertrieb ist Wiederholung mit Verbesserung.", author: null },
  { text: "Sei so neugierig auf den Kunden wie auf dein eigenes Angebot.", author: null },
  { text: "Beharrlichkeit schlägt Talent, wenn Talent nicht beharrlich ist.", author: null },
  { text: "Menschen kaufen von Menschen, denen sie vertrauen — nicht von der besten Präsentation.", author: null },
  { text: "Der Preis ist nur ein Problem, wenn der Wert nicht klar ist.", author: null },
  { text: "Jede Ablehnung bringt dich näher an das nächste Ja.", author: null },
  { text: "Gute Verkäufer lösen Probleme. Großartige Verkäufer verhindern sie.", author: null },
  { text: "Stille nach einer Frage ist oft die stärkste Verkaufstechnik.", author: null },
  { text: "Verkaufen ist der Transfer von Überzeugung.", author: "Zig Ziglar" },
  { text: "Menschen mögen es nicht, wenn man ihnen etwas verkauft — aber sie lieben es zu kaufen.", author: "Jeffrey Gitomer" },
  { text: "Behandle jeden Kunden so, als wäre er der einzige, den du je gewinnen wirst.", author: null },
  { text: "Dein Ton am Telefon entscheidet oft mehr als deine Worte.", author: null },
  { text: "Die Vorbereitung vor dem Anruf entscheidet über das Gespräch selbst.", author: null },
  { text: "Ein zufriedener Kunde ist die beste Werbung, die es gibt.", author: null },
  { text: "Wer die Bedürfnisse kennt, braucht keine Tricks.", author: null },
  { text: "Kaltakquise ist kein Zahlenspiel — es ist ein Vertrauensspiel.", author: null },
  { text: "Der Unterschied zwischen gut und großartig ist die Nachbereitung.", author: null },
  { text: "Verkaufen beginnt dort, wo der Kunde 'Nein' sagt.", author: "Elmer Wheeler" },
];

export function quoteOfTheDay() {
  const dayNum = Math.floor(Date.now() / 86400000);
  return SALES_QUOTES[dayNum % SALES_QUOTES.length];
}

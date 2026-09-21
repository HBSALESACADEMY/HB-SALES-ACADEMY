// Ein Satz Erklärung — dort, wo er gebraucht wird.
//
// Das Tutorial erklärte am ersten Tag fünf Bereiche auf einmal, von denen
// vier erst Wochen später dran sind. Gelernt wird beim Tun: Wer den Call
// Tracker zum ersten Mal öffnet, liest einen Satz dazu — und nie wieder.
//
// Bewusst EIN Satz je Seite. Zwei Sätze liest niemand, drei sind ein
// Handbuch, und ein Handbuch liest erst recht niemand.
export const SEITEN_HINWEISE = [
  {
    pfad: "/call-tracker",
    text: "Trag jede Anwahl sofort ein, ein Klick je Anruf — daraus entstehen deine Quoten, dein Tagesziel-Ring und die Auswertung am nächsten Morgen.",
  },
  {
    pfad: "/termine",
    text: "Ein Interessent ist ein Eintrag, der durch die Stufen wandert: Setting Call, Follow-up, Closing, Check-in. Der Balken zeigt, wie weit ihr seid.",
  },
  {
    pfad: "/follow-up",
    text: "Hier steht, was auf dich wartet: nachfassen, Ergebnis eintragen, fertig. Diese Liste ist der Unterschied zwischen „später mal“ und „gemacht“.",
  },
  {
    pfad: "/email-marketing",
    text: "Nach dem Verschicken gleich ein Follow-up eintragen — die meisten Kontakte gehen nicht verloren, weil sie Nein sagen, sondern weil niemand nachhakt.",
  },
  {
    pfad: "/kalender",
    text: "Termine, Aufgaben und Follow-ups an einer Stelle. Du kannst den Kalender auch auf deinem Handy abonnieren.",
  },
  {
    pfad: "/courses",
    text: "Arbeite dich Kurs für Kurs durch. Jeder endet mit einer Prüfung und einem Zertifikat — zehn Minuten am Tag reichen für den Anfang.",
  },
  {
    pfad: "/roleplay",
    text: "Üben ohne Risiko: Der Trainer spielt den Kunden, du führst das Gespräch und bekommst danach eine Rückmeldung.",
  },
  {
    pfad: "/kunden",
    text: "Deine gewonnenen Kunden. Nach dem Abschluss kommen noch die Umsetzung und der Anruf einen Monat später — erst daraus werden Empfehlungen.",
  },
  {
    pfad: "/ziele",
    text: "Was du und dein Team euch vorgenommen habt, mit dem aktuellen Stand. Ziele sind hier kein Druckmittel, sondern eine Richtung.",
  },
  {
    pfad: "/settings",
    text: "Verbinde hier dein Telegram: Dann kommen Follow-ups und deine Auswertung direkt aufs Handy.",
  },
];

/** Der Hinweis zu dieser Seite — oder null, wenn es für sie keinen gibt. */
export function hinweisFuer(pfad) {
  return SEITEN_HINWEISE.find((h) => h.pfad === pfad) || null;
}

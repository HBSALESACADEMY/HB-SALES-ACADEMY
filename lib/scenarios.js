// Szenario-Simulator: Entscheidungsbaum-Trainingsfälle.
// Jeder Knoten hat einen Text + 2-3 Optionen, die zu weiteren Knoten oder
// direkt zu einem Ausgang (outcomes) führen.

export const SCENARIOS = [
  {
    id: "preiseinwand",
    title: "Der Preis-Einwand am Telefon",
    intro: "Du bist mitten im Erstgespräch mit einem Handwerksbetrieb. Interesse ist da — dann kommt der Satz:",
    start: "n1",
    nodes: {
      n1: {
        text: "„990 € ist mir ehrlich gesagt zu viel dafür.“",
        options: [
          { label: "Sofort einen Rabatt anbieten", next: "n2a" },
          { label: "Anerkennen und nachfragen, was genau zu viel erscheint", next: "n2b" },
          { label: "Den Preis direkt verteidigen, ohne nachzufragen", next: "n2c" },
        ],
      },
      n2a: {
        text: "Der Kunde nimmt den Rabatt gerne an, fragt aber sofort: „Geht da noch was runter?“",
        options: [
          { label: "Noch mehr Rabatt geben", next: "end_bad" },
          { label: "Jetzt eine Gegenleistung einfordern (z. B. Zusage heute)", next: "end_ok" },
        ],
      },
      n2b: {
        text: "Der Kunde sagt: „Ich weiß einfach nicht, ob sich das für einen kleinen Betrieb wie meinen lohnt.“",
        options: [
          { label: "Auf Tageskosten runterbrechen und langfristigen Nutzen zeigen", next: "end_good" },
          { label: "Erwähnen, dass andere Kunden auch skeptisch waren", next: "end_ok" },
        ],
      },
      n2c: {
        text: "Der Kunde wird defensiv: „Dann eben nicht, ich schau mich noch um.“",
        options: [
          { label: "Nachfragen, was genau abschreckt", next: "end_ok" },
          { label: "Auflegen lassen, ohne nachzufassen", next: "end_bad" },
        ],
      },
      end_good: { outcome: true, text: "Der Kunde erkennt den echten Wert, ihr vereinbart direkt einen Starttermin. Starker Abschluss!", score: 100 },
      end_ok: { outcome: true, text: "Das Gespräch bleibt offen, ein Rückruf ist vereinbart — ausbaufähig, aber nicht verloren.", score: 60 },
      end_bad: { outcome: true, text: "Der Kunde verabschiedet sich unentschlossen. Diese Chance ist wahrscheinlich verloren.", score: 20 },
    },
  },
  {
    id: "rueckruf-aufschub",
    title: "„Rufen Sie in ein paar Wochen nochmal an“",
    intro: "Du hast gerade dein Angebot vorgestellt. Der Kunde klingt nicht unfreundlich, aber:",
    start: "n1",
    nodes: {
      n1: {
        text: "„Klingt interessant, aber melden Sie sich einfach in ein paar Wochen nochmal, gerade ist viel los.“",
        options: [
          { label: "Akzeptieren und in 4 Wochen wieder anrufen", next: "end_bad" },
          { label: "Freundlich nachfragen, was konkret dagegen spricht, jetzt kurz zu klären", next: "n2a" },
          { label: "Druck aufbauen: 'Das Angebot gilt nur diese Woche'", next: "n2b" },
        ],
      },
      n2a: {
        text: "Der Kunde öffnet sich: „Ehrlich, ich bin mir nicht sicher, ob wir das gerade brauchen.“",
        options: [
          { label: "Konkreten Nutzen an seiner Situation festmachen, dann kurzen Termin anbieten", next: "end_good" },
          { label: "Einfach das Angebot nochmal wiederholen", next: "end_ok" },
        ],
      },
      n2b: {
        text: "Der Kunde reagiert genervt: „Ich lass mich nicht unter Druck setzen.“",
        options: [
          { label: "Zurückrudern, ehrlich entschuldigen, sachlich nachfragen", next: "end_ok" },
          { label: "Beim Druck bleiben", next: "end_bad" },
        ],
      },
      end_good: { outcome: true, text: "Der Kunde ist überzeugt und vereinbart einen kurzen Termin diese Woche. Sehr gut gelöst!", score: 100 },
      end_ok: { outcome: true, text: "Der Kunde bleibt vage, aber das Gespräch ist nicht beendet — nachfassen lohnt sich.", score: 55 },
      end_bad: { outcome: true, text: "Der Kunde schiebt endgültig auf oder legt genervt auf. Der Lead ist wahrscheinlich kalt.", score: 15 },
    },
  },
];

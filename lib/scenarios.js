// Szenario-Simulator: Entscheidungsbaum-Trainingsfälle.
// Bewusst produktneutral gehalten — funktioniert für jeden Vertrieb, unabhängig
// davon, was genau verkauft wird. Jeder Knoten hat einen Text + 2-3 Optionen,
// die zu weiteren Knoten oder direkt zu einem Ausgang (outcomes) führen.

export const SCENARIOS = [
  {
    id: "preiseinwand",
    title: "Der Preis-Einwand",
    intro: "Du bist mitten im Erstgespräch. Interesse ist da — dann kommt der Satz:",
    start: "n1",
    nodes: {
      n1: {
        text: "„Das ist mir ehrlich gesagt zu teuer.“",
        options: [
          { label: "Sofort einen Rabatt anbieten", next: "n2a" },
          { label: "Anerkennen und nachfragen, was genau zu teuer erscheint", next: "n2b" },
          { label: "Den Preis direkt verteidigen, ohne nachzufragen", next: "n2c" },
        ],
      },
      n2a: {
        text: "Der Kunde nimmt den Rabatt gerne an, fragt aber sofort: „Geht da noch was runter?“",
        options: [
          { label: "Noch mehr Rabatt geben", next: "n3a" },
          { label: "Jetzt eine Gegenleistung einfordern (z. B. Zusage heute)", next: "n3b" },
        ],
      },
      n2b: {
        text: "Der Kunde sagt: „Ich weiß einfach nicht, ob sich das für uns lohnt.“",
        options: [
          { label: "Auf Tages-/Stückkosten runterbrechen und langfristigen Nutzen zeigen", next: "n3c" },
          { label: "Erwähnen, dass andere Kunden auch skeptisch waren", next: "n3d" },
        ],
      },
      n2c: {
        text: "Der Kunde wird defensiv: „Dann eben nicht, ich schau mich noch um.“",
        options: [
          { label: "Nachfragen, was genau abschreckt", next: "n3d" },
          { label: "Auflegen lassen, ohne nachzufassen", next: "end_bad" },
        ],
      },
      n3a: { text: "Der Kunde wird fordernder: „Dann sicher auch noch bei den Konditionen?“", options: [
        { label: "Klare Grenze ziehen und den Wert erneut betonen", next: "end_ok" },
        { label: "Nachgeben, um den Abschluss nicht zu riskieren", next: "end_bad" },
      ]},
      n3b: { text: "Der Kunde überlegt kurz: „Gut, wenn ich heute unterschreibe, was ist drin?“", options: [
        { label: "Konkretes Zusatzelement anbieten (nicht nur Rabatt) und abschließen", next: "end_good" },
        { label: "Unsicher werden und das Gespräch verlängern", next: "end_ok" },
      ]},
      n3c: { text: "Der Kunde nickt nachdenklich: „Okay, so gesehen wirkt das anders.“", options: [
        { label: "Direkt zur Abschlussfrage übergehen", next: "end_good" },
        { label: "Noch mehr Informationen nachschieben, statt zu fragen", next: "end_ok" },
      ]},
      n3d: { text: "Der Kunde bleibt vage: „Kann sein, ich muss da nochmal drüber schlafen.“", options: [
        { label: "Konkreten Rückruftermin vereinbaren", next: "end_ok" },
        { label: "Es dabei belassen, ohne nächsten Schritt", next: "end_bad" },
      ]},
      end_good: { outcome: true, text: "Der Kunde erkennt den echten Wert und unterschreibt direkt. Starker Abschluss!", score: 100 },
      end_ok: { outcome: true, text: "Das Gespräch bleibt offen, ein nächster Schritt ist vereinbart — ausbaufähig, aber nicht verloren.", score: 55 },
      end_bad: { outcome: true, text: "Der Kunde verabschiedet sich unentschlossen. Diese Chance ist wahrscheinlich verloren.", score: 15 },
    },
  },
  {
    id: "rueckruf-aufschub",
    title: "„Melden Sie sich einfach später nochmal“",
    intro: "Du hast gerade dein Angebot vorgestellt. Der Kunde klingt nicht unfreundlich, aber:",
    start: "n1",
    nodes: {
      n1: {
        text: "„Klingt interessant, aber melden Sie sich einfach in ein paar Wochen nochmal, gerade ist viel los.“",
        options: [
          { label: "Akzeptieren und in einigen Wochen wieder anrufen", next: "end_bad" },
          { label: "Freundlich nachfragen, was konkret dagegen spricht, jetzt kurz zu klären", next: "n2a" },
          { label: "Druck aufbauen: „Das Angebot gilt nur diese Woche“", next: "n2b" },
        ],
      },
      n2a: {
        text: "Der Kunde öffnet sich: „Ehrlich, ich bin mir nicht sicher, ob wir das gerade brauchen.“",
        options: [
          { label: "Konkreten Nutzen an seiner Situation festmachen", next: "n3a" },
          { label: "Einfach das Angebot nochmal wiederholen", next: "n3b" },
        ],
      },
      n2b: {
        text: "Der Kunde reagiert genervt: „Ich lass mich nicht unter Druck setzen.“",
        options: [
          { label: "Zurückrudern, ehrlich entschuldigen, sachlich nachfragen", next: "n3b" },
          { label: "Beim Druck bleiben", next: "end_bad" },
        ],
      },
      n3a: { text: "Der Kunde wird konkreter: „Was würde sich bei uns denn wirklich ändern?“", options: [
        { label: "Ein greifbares Beispiel nennen, dann kurzen Termin anbieten", next: "end_good" },
        { label: "Allgemein bleiben und abwarten", next: "end_ok" },
      ]},
      n3b: { text: "Der Kunde taut etwas auf: „Na gut, was wollten Sie denn konkret vorschlagen?“", options: [
        { label: "Einen kurzen, konkreten nächsten Schritt anbieten", next: "end_ok" },
        { label: "Nochmal von vorne die ganze Präsentation beginnen", next: "end_bad" },
      ]},
      end_good: { outcome: true, text: "Der Kunde ist überzeugt und vereinbart einen kurzen Termin diese Woche. Sehr gut gelöst!", score: 100 },
      end_ok: { outcome: true, text: "Der Kunde bleibt vage, aber das Gespräch ist nicht beendet — nachfassen lohnt sich.", score: 55 },
      end_bad: { outcome: true, text: "Der Kunde schiebt endgültig auf oder legt genervt auf. Der Lead ist wahrscheinlich kalt.", score: 15 },
    },
  },
  {
    id: "gatekeeper",
    title: "Die Empfangsperson lässt dich nicht durch",
    intro: "Du rufst bei einem interessanten Zielkunden an. Die Person am Empfang übernimmt:",
    start: "n1",
    nodes: {
      n1: {
        text: "„Worum geht's denn genau? Ich kann Sie auch einfach in ein Verzeichnis eintragen, dann ruft die Chefin zurück, falls Interesse besteht.“",
        options: [
          { label: "Einen konkreten, ehrlichen Grund nennen und niedrige Hürde anbieten", next: "n2a" },
          { label: "Vage bleiben, um nicht abgewimmelt zu werden", next: "n2b" },
          { label: "Auf sofortiger Durchstellung bestehen", next: "n2c" },
        ],
      },
      n2a: { text: "Die Empfangsperson wird kooperativer: „Okay, wann passt es Ihnen denn für einen kurzen Rückruf?“", options: [
        { label: "Konkretes, kurzes Zeitfenster vorschlagen", next: "end_good" },
        { label: "Unverbindlich bleiben: „Irgendwann diese Woche“", next: "end_ok" },
      ]},
      n2b: { text: "Die Empfangsperson bleibt skeptisch: „Ich trag Sie dann einfach ein.“", options: [
        { label: "Jetzt doch einen klaren Grund nachliefern", next: "end_ok" },
        { label: "Es dabei belassen", next: "end_bad" },
      ]},
      n2c: { text: "Die Empfangsperson wird eher abweisend: „Das entscheide ich, nicht Sie.“", options: [
        { label: "Zurückrudern, sich entschuldigen, sachlich neu ansetzen", next: "end_ok" },
        { label: "Weiter Druck machen", next: "end_bad" },
      ]},
      end_good: { outcome: true, text: "Ein klarer Rückruftermin steht — die Empfangsperson wird zur Verbündeten. Sehr gut gelöst!", score: 100 },
      end_ok: { outcome: true, text: "Es bleibt vage, aber die Tür ist nicht zu — ein erneuter Versuch lohnt sich.", score: 55 },
      end_bad: { outcome: true, text: "Die Empfangsperson blockt endgültig ab. Dieser Zugang ist erstmal verloren.", score: 15 },
    },
  },
  {
    id: "konkurrenzvergleich",
    title: "„Wir haben schon einen Anbieter“",
    intro: "Der Kunde zeigt Interesse, bremst dann aber:",
    start: "n1",
    nodes: {
      n1: {
        text: "„Wir arbeiten da schon mit jemand anderem zusammen, das läuft eigentlich ganz gut.“",
        options: [
          { label: "Nachfragen, was am aktuellen Anbieter besonders gut läuft und was nicht", next: "n2a" },
          { label: "Sofort den eigenen Anbieter schlechtreden", next: "n2b" },
          { label: "Direkt aufgeben: „Alles klar, dann nicht“", next: "end_bad" },
        ],
      },
      n2a: { text: "Der Kunde wird offener: „Naja, ein bisschen langsam in der Kommunikation ist er schon.“", options: [
        { label: "Genau an diesem Punkt ansetzen und einen konkreten Unterschied zeigen", next: "end_good" },
        { label: "Allgemein bleiben: „Bei uns ist alles besser“", next: "n3a" },
      ]},
      n2b: { text: "Der Kunde wird defensiv: „Naja, so schlecht ist der auch wieder nicht.“", options: [
        { label: "Zurückrudern und sachlich nach den echten Kriterien fragen", next: "n3a" },
        { label: "Beim Vergleich bleiben", next: "end_bad" },
      ]},
      n3a: { text: "Der Kunde bleibt unentschlossen: „Vielleicht könnte man das mal vergleichen.“", options: [
        { label: "Ein konkretes, kleines Testangebot vorschlagen", next: "end_ok" },
        { label: "Nur ein weiteres Infomaterial zusenden, ohne nächsten Schritt", next: "end_bad" },
      ]},
      end_good: { outcome: true, text: "Der Kunde erkennt einen klaren Unterschied und ist bereit für ein Testgespräch. Starker Zug!", score: 100 },
      end_ok: { outcome: true, text: "Ein kleiner Vergleichstest ist vereinbart — ein guter erster Schritt.", score: 55 },
      end_bad: { outcome: true, text: "Der Kunde bleibt beim aktuellen Anbieter. Diese Chance ist erstmal vertan.", score: 15 },
    },
  },
  {
    id: "interne-abstimmung",
    title: "„Das muss ich erst intern abstimmen“",
    intro: "Das Gespräch lief gut, doch am Ende kommt:",
    start: "n1",
    nodes: {
      n1: {
        text: "„Klingt gut, aber das muss ich erst mit meinem Team/Chef abstimmen.“",
        options: [
          { label: "Nachfragen, wer noch beteiligt ist und was diese Person braucht", next: "n2a" },
          { label: "Einfach warten, bis sich der Kunde von selbst meldet", next: "end_bad" },
          { label: "Druck aufbauen: „Das müssen Sie doch selbst entscheiden können“", next: "n2b" },
        ],
      },
      n2a: { text: "Der Kunde antwortet: „Meine Kollegin schaut vor allem aufs Budget.“", options: [
        { label: "Anbieten, eine kurze Zusammenfassung für die Kollegin mitzuliefern", next: "end_good" },
        { label: "Nur sagen: „Dann sagen Sie einfach Bescheid“", next: "n3a" },
      ]},
      n2b: { text: "Der Kunde wirkt genervt: „Ich will das trotzdem intern abklären.“", options: [
        { label: "Zurückrudern und konstruktiv nach dem weiteren Ablauf fragen", next: "n3a" },
        { label: "Beim Druck bleiben", next: "end_bad" },
      ]},
      n3a: { text: "Der Kunde bleibt vage: „Ich melde mich, wenn es soweit ist.“", options: [
        { label: "Einen konkreten Folgetermin fix vereinbaren", next: "end_ok" },
        { label: "Es dabei belassen, ohne Termin", next: "end_bad" },
      ]},
      end_good: { outcome: true, text: "Mit einer maßgeschneiderten Zusammenfassung für den Entscheider ist der Weg zum Abschluss frei. Sehr gut gelöst!", score: 100 },
      end_ok: { outcome: true, text: "Ein fixer Folgetermin steht — nicht ideal, aber der Ball bleibt in Bewegung.", score: 55 },
      end_bad: { outcome: true, text: "Ohne konkreten nächsten Schritt verläuft sich der Kontakt wahrscheinlich im Sand.", score: 15 },
    },
  },
  {
    id: "vertrauensskepsis",
    title: "„Klingt zu gut, um wahr zu sein“",
    intro: "Du hast gerade den Nutzen deines Angebots erklärt. Der Kunde reagiert misstrauisch:",
    start: "n1",
    nodes: {
      n1: {
        text: "„Ehrlich, das klingt zu gut um wahr zu sein — wo ist der Haken?“",
        options: [
          { label: "Offen über Grenzen/Einschränkungen sprechen, bevor gefragt wird", next: "n2a" },
          { label: "Beteuern, dass es wirklich keinen Haken gibt", next: "n2b" },
          { label: "Das Misstrauen ignorieren und einfach weiterreden", next: "end_bad" },
        ],
      },
      n2a: { text: "Der Kunde nickt langsam: „Okay, das klingt schon ehrlicher.“", options: [
        { label: "Ein konkretes Referenzbeispiel oder Nachweis anbieten", next: "end_good" },
        { label: "Beim allgemeinen Versprechen bleiben", next: "n3a" },
      ]},
      n2b: { text: "Der Kunde bleibt skeptisch: „Das sagt jeder.“", options: [
        { label: "Doch noch konkrete Belege/Referenzen nachliefern", next: "n3a" },
        { label: "Erneut nur beteuern", next: "end_bad" },
      ]},
      n3a: { text: "Der Kunde überlegt: „Na gut, zeigen Sie mir das mal an einem Beispiel.“", options: [
        { label: "Ein konkretes, überprüfbares Beispiel liefern", next: "end_ok" },
        { label: "Nur allgemein bleiben", next: "end_bad" },
      ]},
      end_good: { outcome: true, text: "Der Kunde ist überzeugt, weil die Ehrlichkeit über Grenzen Vertrauen geschaffen hat. Starker Zug!", score: 100 },
      end_ok: { outcome: true, text: "Der Kunde bleibt vorsichtig optimistisch — ein konkreter Beweis würde jetzt helfen.", score: 55 },
      end_bad: { outcome: true, text: "Der Kunde bleibt misstrauisch und verabschiedet sich unverbindlich.", score: 15 },
    },
  },
  {
    id: "kein-akuter-bedarf",
    title: "„Wir brauchen das gerade nicht“",
    intro: "Dein Angebot passt eigentlich gut, aber der Kunde winkt ab:",
    start: "n1",
    nodes: {
      n1: {
        text: "„Ehrlich gesagt, gerade sehe ich da keinen akuten Bedarf bei uns.“",
        options: [
          { label: "Nachfragen, wie die aktuelle Situation konkret aussieht", next: "n2a" },
          { label: "Sofort ein Zukunfts-Szenario ausmalen, um Dringlichkeit zu erzeugen", next: "n2b" },
          { label: "Das Gespräch direkt beenden", next: "end_bad" },
        ],
      },
      n2a: { text: "Der Kunde erzählt: „Wir kommen gerade so klar, ist aber schon manchmal knapp.“", options: [
        { label: "Genau an diesem wunden Punkt ansetzen", next: "end_good" },
        { label: "Allgemein bleiben, ohne auf den Punkt einzugehen", next: "n3a" },
      ]},
      n2b: { text: "Der Kunde wirkt unsicher: „Das übertreiben Sie jetzt aber, oder?“", options: [
        { label: "Zurückrudern, sachlich nach der echten Situation fragen", next: "n3a" },
        { label: "Beim Dringlichkeitsdruck bleiben", next: "end_bad" },
      ]},
      n3a: { text: "Der Kunde bleibt abwartend: „Vielleicht in ein paar Monaten mal wieder anfragen.“", options: [
        { label: "Konkreten Zeitpunkt für den nächsten Kontakt festlegen", next: "end_ok" },
        { label: "Es unverbindlich lassen", next: "end_bad" },
      ]},
      end_good: { outcome: true, text: "Der Kunde erkennt den echten eigenen Engpass und will jetzt handeln. Sehr gut gelöst!", score: 100 },
      end_ok: { outcome: true, text: "Ein konkreter Wiedervorlage-Termin steht — ausbaufähig, aber nicht verloren.", score: 55 },
      end_bad: { outcome: true, text: "Der Kunde bleibt unentschlossen ohne festen nächsten Schritt. Der Kontakt kühlt ab.", score: 15 },
    },
  },
  {
    id: "beschwerde-rettung",
    title: "Ein bestehender Kunde ist unzufrieden",
    intro: "Ein Bestandskunde meldet sich verärgert:",
    start: "n1",
    nodes: {
      n1: {
        text: "„Ich bin ehrlich gesagt ziemlich enttäuscht, das läuft nicht so wie versprochen.“",
        options: [
          { label: "Zuerst zuhören und die Frustration ernst nehmen", next: "n2a" },
          { label: "Sofort erklären, warum das nicht am eigenen Angebot liegt", next: "n2b" },
          { label: "Das Anliegen herunterspielen", next: "end_bad" },
        ],
      },
      n2a: { text: "Der Kunde beruhigt sich etwas: „Gut, dass Sie zuhören. Konkret ist X das Problem.“", options: [
        { label: "Eine konkrete Lösung oder nächsten Schritt anbieten", next: "end_good" },
        { label: "Nur Verständnis zeigen, ohne konkrete Lösung", next: "n3a" },
      ]},
      n2b: { text: "Der Kunde wird lauter: „Mir ist egal, woran es liegt, ich will eine Lösung.“", options: [
        { label: "Zurückrudern und doch eine konkrete Lösung anbieten", next: "n3a" },
        { label: "Bei der Rechtfertigung bleiben", next: "end_bad" },
      ]},
      n3a: { text: "Der Kunde bleibt abwartend: „Na gut, was schlagen Sie jetzt vor?“", options: [
        { label: "Einen klaren, terminierten Lösungsschritt zusagen", next: "end_ok" },
        { label: "Vage versprechen, sich zu kümmern", next: "end_bad" },
      ]},
      end_good: { outcome: true, text: "Der Kunde fühlt sich ernst genommen und bleibt an Bord. Sehr gut gerettet!", score: 100 },
      end_ok: { outcome: true, text: "Der Kunde bleibt vorerst, ist aber noch nicht vollständig beruhigt.", score: 55 },
      end_bad: { outcome: true, text: "Der Kunde bleibt frustriert und denkt über einen Wechsel nach.", score: 15 },
    },
  },
];

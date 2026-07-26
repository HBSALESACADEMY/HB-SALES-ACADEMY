// HB Sales Academy — Curriculum data.
// Each module: theory (2 short paragraphs), 6 multiple-choice questions
// (shuffled at render time so option order is never a giveaway), and
// 1 open-ended case-study question graded by the AI grading endpoint.

export const COURSES = [
{
  id: "grundlagen", title: "Grundlagen", accent: "#00E5C7",
  desc: "Basiswissen: wie Kaufentscheidungen wirklich entstehen.",
  examCase: { id:"grundlagen-exam", prompt: "Ein neuer Interessent ruft an und sagt gleich zu Beginn: \"Schicken Sie mir am besten nur ein PDF, ich vergleiche das intern mit zwei anderen Anbietern nach Preis und Leistung.\" Beschreibe, wie du dieses Gespräch führst: wie du dennoch ein echtes Gespräch ermöglichst, System-1/System-2 berücksichtigst und dabei durchgehend ethisch bleibst.", keyPoints:["Versucht ein echtes Gespräch zu ermöglichen statt nur Material zu senden","Berücksichtigt, dass die Entscheidung nicht rein rational fallen wird","Bleibt komplett ehrlich, keine erfundene Dringlichkeit oder Falschaussagen","Zeigt Verständnis für die Position des Kunden, statt Druck aufzubauen"] },
  modules: [
    {
      id: "g1", title: "Verkaufspsychologie Basics",
      theory: "Kaufentscheidungen werden selten rein rational getroffen. Das AIDA-Modell (Attention, Interest, Desire, Action) beschreibt die typischen Phasen einer Kaufabsicht. Nach Kahneman entscheidet \"System 1\" schnell, intuitiv und emotional – die meisten Kaufimpulse entstehen hier, \"System 2\" liefert erst danach die rationale Begründung.\n\nFür Verkäufer bedeutet das: Wer nur Fakten aufzählt, spricht primär System 2 an – aber die eigentliche Entscheidung fällt oft schon vorher, emotional. Gute Gesprächsführung adressiert deshalb beides: ein Gefühl erzeugen und es anschließend rational absichern, damit der Kunde sich auch vor sich selbst und anderen rechtfertigen kann.",
      mc: [
        { q: "Wofür steht AIDA im Verkaufskontext?", options: ["Attention-Interest-Desire-Action","Analyse-Idee-Diskussion-Abschluss","Angebot-Interesse-Design-Aktion","Ansprache-Information-Dialog-Auswertung"], correct: 0 },
        { q: "Wie trifft \"System 1\" nach Kahneman Entscheidungen?", options: ["Langsam und rein analytisch","Schnell, intuitiv und emotional","Zufällig ohne erkennbares Muster","Nur bei komplexen Finanzentscheidungen"], correct: 1 },
        { q: "Warum reicht reines Faktenwissen über ein Produkt oft nicht zum Verkaufen aus?", options: ["Weil Fakten grundsätzlich falsch sind","Weil Kunden generell keine Fakten mögen","Weil Kaufentscheidungen primär emotional getroffen und erst danach rational begründet werden","Weil das gesetzlich verboten ist"], correct: 2 },
        { q: "Was unterscheidet Verkaufspsychologie grundlegend von Manipulation?", options: ["Es gibt keinen Unterschied","Manipulation ist immer teurer","Verkaufspsychologie nutzt Prinzipien transparent und im beiderseitigen Interesse, Manipulation täuscht bewusst zum eigenen Vorteil","Manipulation funktioniert nur online"], correct: 2 },
        { q: "Welche Aussage beschreibt die Rolle von \"System 2\" im Verkaufsgespräch am besten?", options: ["System 2 liefert oft die nachträgliche rationale Rechtfertigung einer bereits emotional gefällten Entscheidung","System 2 trifft immer die erste Kaufentscheidung","System 2 ist für Verkaufsgespräche irrelevant","System 2 wird nur bei Kleinbeträgen aktiv"], correct: 0 },
        { q: "Ein Kunde kauft impulsiv und begründet die Entscheidung erst danach mit Argumenten wie \"das Preis-Leistungs-Verhältnis stimmt\". Was zeigt das?", options: ["Reines rationales Entscheidungsverhalten","Nachträgliche Rationalisierung einer emotional gefällten Entscheidung","Einen Fehlkauf, der rückgängig gemacht wird","Dass Verkaufspsychologie hier nicht wirkt"], correct: 1 }
      ],
      open: { id:"g1-open", prompt: "Ein Kunde sagt am Telefon: \"Schicken Sie mir einfach die technischen Daten, ich entscheide dann rein nach Zahlen.\" Wie gehst du damit um, wenn du weißt, dass Kaufentscheidungen selten rein rational fallen? Beschreibe dein konkretes Vorgehen.", keyPoints: ["Erkennt, dass hinter der rationalen Fassade meist doch emotionale/praktische Bedürfnisse stehen", "Schlägt vor, trotzdem ein kurzes Gespräch zu führen um Bedarf/Kontext zu verstehen, nicht nur Daten zu senden", "Bereit, sowohl Fakten zu liefern als auch emotional relevante Aspekte (Sicherheit, Zeitersparnis etc.) anzusprechen", "Vermeidet, dem Kunden zu widersprechen oder ihn zu belehren"] }
    },
    {
      id: "g2", title: "Kaufentscheidungsprozess",
      theory: "Der klassische Kaufentscheidungsprozess verläuft in fünf Phasen: Bedarfserkennung, Informationssuche, Bewertung der Alternativen, Kaufentscheidung, Nachkaufverhalten. Gerade die letzte Phase wird oft unterschätzt: Hier kann kognitive Dissonanz (\"Kaufreue\") entstehen, die aktiv aufgefangen werden sollte.\n\nJede Phase erfordert eine andere Gesprächshaltung. In der Bedarfserkennung sind Fragen wichtiger als Argumente, in der Bewertungsphase zählt Differenzierung von Alternativen, und nach dem Abschluss zählt Bestätigung statt neuer Verkaufsargumente – sonst wirkt es wie Nachdruck statt Fürsorge.",
      mc: [
        { q: "Welche Phase folgt im klassischen Modell direkt auf die Informationssuche?", options: ["Bedarfserkennung","Bewertung der Alternativen","Nachkaufverhalten","Direkt die Kaufentscheidung ohne Bewertung"], correct: 1 },
        { q: "Warum ist die Phase \"Nachkaufverhalten\" psychologisch relevant für Verkäufer?", options: ["Weil hier die Rechnung gestellt wird","Weil hier kognitive Dissonanz entstehen kann, die aktiv reduziert werden sollte","Weil hier nochmal über den Preis verhandelt wird","Sie ist irrelevant, der Verkauf ist bereits abgeschlossen"], correct: 1 },
        { q: "Was beschreibt der Begriff \"kognitive Dissonanz\" im Kaufkontext?", options: ["Ein Rabattmodell","Die Reihenfolge der Kaufphasen","Das unangenehme Gefühl, wenn eine Entscheidung im Nachhinein infrage gestellt wird","Die Fähigkeit, mehrere Angebote gleichzeitig zu vergleichen"], correct: 2 },
        { q: "Welche Maßnahme reduziert Kaufreue nach dem Abschluss am wirksamsten?", options: ["Den Kunden danach nicht mehr kontaktieren","Sofort das nächste Produkt anbieten","Bestätigung der guten Entscheidung + klare nächste Schritte kommunizieren","Den Preis nachträglich senken"], correct: 2 },
        { q: "In welcher Phase sind gezielte Fragen wichtiger als Argumente?", options: ["Bedarfserkennung","Nachkaufverhalten","Kaufentscheidung","Bewertung der Alternativen"], correct: 0 },
        { q: "Warum kann zu viel Verkaufsargumentation direkt nach dem Abschluss schaden?", options: ["Sie ist gesetzlich nicht erlaubt","Sie kann wie Nachdruck statt Fürsorge wirken und Zweifel erst auslösen","Sie erhöht immer den Umsatz zusätzlich","Sie hat grundsätzlich keine Wirkung mehr"], correct: 1 }
      ],
      open: { id:"g2-open", prompt: "Ein Kunde hat vor drei Tagen unterschrieben und schreibt jetzt: \"Ich bin mir nicht mehr so sicher, ob das die richtige Entscheidung war.\" Wie reagierst du, um Kaufreue psychologisch fundiert aufzufangen, ohne aufdringlich zu wirken?", keyPoints:["Nimmt die Sorge ernst, statt sie herunterzuspielen","Bestätigt konkret die Vorteile der bereits getroffenen Entscheidung, ohne neu zu verkaufen", "Bietet an, offene Fragen zu klären oder nächste Schritte transparent zu machen", "Vermeidet Druck oder das Gefühl, der Kunde müsse sich rechtfertigen"] }
    },
    {
      id: "g3", title: "Ethik & Manipulation",
      theory: "Ethische Beeinflussung und Manipulation nutzen oft dieselben psychologischen Prinzipien – der Unterschied liegt in Transparenz und Wahrheitsgehalt. Erfundene Dringlichkeit oder bewusst verschwiegene Nachteile schaden dem Vertrauen und damit langfristig dem Geschäft.\n\nEin einfacher Test: Würde die Aussage auch dann noch stimmen, wenn der Kunde sie komplett nachprüfen könnte? Wenn nein, handelt es sich um Manipulation, unabhängig davon, ob sie kurzfristig funktioniert.",
      mc: [
        { q: "Was unterscheidet ethische Beeinflussung von Manipulation am klarsten?", options: ["Die Höhe des Verkaufspreises","Transparenz und Wahrheitsgehalt der genutzten Informationen","Die Sympathie des Verkäufers","Die Dauer des Gesprächs"], correct: 1 },
        { q: "Eine erfundene Verknappung (\"nur noch 1 Stück\", obwohl falsch) ist:", options: ["Ein legitimes Verkaufsprinzip","Manipulation, da auf einer Lüge basierend","Irrelevant für die Kaufentscheidung","Nur bei Onlineshops problematisch"], correct: 1 },
        { q: "Warum schadet unethisches Verkaufen langfristig dem Geschäft?", options: ["Es gibt keine langfristigen Folgen","Vertrauen ist einmal verloren schwer wiederherzustellen, Folgegeschäfte sinken","Es ist immer sofort strafbar","Kunden merken es nie"], correct: 1 },
        { q: "Welches Verhalten ist ethisch vertretbar?", options: ["Wichtige Nachteile bei Nachfrage bewusst verschweigen","Konkurrenzprodukte durch falsche Behauptungen schlechtreden","Künstlichen Zeitdruck erfinden","Echte Kundenvorteile klar und ehrlich hervorheben"], correct: 3 },
        { q: "Welcher einfache Test hilft, Manipulation von legitimer Beeinflussung zu unterscheiden?", options: ["Ob die Aussage auch bei vollständiger Überprüfung durch den Kunden stimmen würde","Ob die Aussage den Umsatz kurzfristig steigert","Ob der Kunde die Aussage glaubt","Ob ein Kollege dieselbe Aussage auch nutzen würde"], correct: 0 },
        { q: "Ein Verkäufer verschweigt auf direkte Nachfrage eine bekannte Einschränkung des Produkts. Das ist:", options: ["Legitime Verkaufstaktik, solange nicht aktiv gelogen wird","Ethisch problematisch, da es den Kunden bei einer informierten Entscheidung behindert","Irrelevant, solange der Kunde zufrieden bleibt","Nur bei B2B-Geschäften ein Problem"], correct: 1 }
      ],
      open: { id:"g3-open", prompt: "Ein Kollege rät dir, bei einem zögernden Kunden zu sagen \"Das Angebot gilt nur noch heute\", obwohl das nicht stimmt. Wie gehst du damit um – sowohl gegenüber dem Kollegen als auch im weiteren Umgang mit dem Kunden?", keyPoints:["Lehnt die erfundene Dringlichkeit klar ab", "Begründet dies mit den langfristigen Vertrauens-/Reputationsrisiken", "Schlägt eine ehrliche Alternative vor (z.B. echte Fristen, echten Mehrwert kommunizieren)", "Bleibt konstruktiv gegenüber dem Kollegen statt nur zu belehren"] }
    }
  ]
},
{
  id: "beziehung", title: "Beziehungsaufbau", accent: "#E8368F",
  desc: "Vertrauen und Rapport aufbauen, bevor überhaupt argumentiert wird.",
  examCase: { id:"beziehung-exam", prompt: "Du triffst einen neuen Kunden zum ersten Mal persönlich. In den ersten zwei Minuten wirkt er reserviert, kaum Blickkontakt, kurze Antworten. Beschreibe konkret dein Vorgehen für die ersten 5 Minuten: wie du Rapport aufbaust, welche SPIN-Fragen du einsetzt und worauf du bei Körpersprache/Stimme achtest.", keyPoints:["Nutzt dezentes Mirroring/Rapport-Aufbau bewusst", "Setzt mindestens eine erkennbare SPIN-Fragen-Kategorie sinnvoll ein","Achtet aktiv auf nonverbale Signale und reagiert darauf","Bleibt geduldig statt sofort in die Produktargumentation zu springen"] },
  modules: [
    {
      id: "b1", title: "Erster Eindruck",
      theory: "Der erste Eindruck prägt (Priming, Halo-Effekt), wie alle folgenden Informationen bewertet werden. Ein positiver erster Eindruck färbt unbewusst auch auf spätere Argumente ab – ein negativer lässt sich später kaum noch korrigieren.\n\nDas gilt nicht nur für Auftreten und Kleidung, sondern auch für die ersten Sätze eines Gesprächs. Eine unsichere Begrüßung oder ein zu forscher Einstieg setzen einen Rahmen, den man später nur mit viel Aufwand wieder verlässt.",
      mc: [
        { q: "Was beschreibt der Halo-Effekt?", options: ["Ein positiver erster Eindruck färbt auf die Bewertung aller weiteren Eigenschaften ab","Kunden erinnern sich nur an den letzten Satz","Der Preis bestimmt automatisch die Qualität","Verkäufer mit Anzug verkaufen grundsätzlich mehr"], correct: 0 },
        { q: "Warum wirkt Priming (z.B. das Wort \"Sicherheit\" vor einem Garantiegespräch) auf spätere Aussagen?", options: ["Es hat keinen nachweisbaren Effekt","Zuvor präsentierte Reize beeinflussen unbewusst, wie nachfolgende Infos bewertet werden","Es funktioniert nur schriftlich","Es wirkt nur bei technischen Produkten"], correct: 1 },
        { q: "Wie lange dauert es typischerweise, bis ein erster Eindruck entsteht?", options: ["Erst nach 30 Minuten Gespräch","Nur bei Videocalls messbar","Innerhalb weniger Sekunden","Erst nach dem dritten Treffen"], correct: 2 },
        { q: "Was ist die praktisch wichtigste Konsequenz aus dem Halo-Effekt für Verkäufer?", options: ["Der Preis ist irrelevant","Auf Auftreten, Pünktlichkeit und Tonfall zu Beginn bewusst achten","Immer zuerst über Rabatte sprechen","Der erste Eindruck lässt sich beliebig korrigieren"], correct: 1 },
        { q: "Ein unsicherer, zu forscher Gesprächseinstieg wirkt sich wie aus?", options: ["Er hat keinen Effekt auf den weiteren Gesprächsverlauf","Er setzt einen ungünstigen Rahmen, der später nur mit Aufwand korrigierbar ist","Er wird von Kunden grundsätzlich ignoriert","Er verbessert paradoxerweise den späteren Eindruck"], correct: 1 },
        { q: "Warum ist ein negativer erster Eindruck später so schwer zu korrigieren?", options:["Weil Kunden ihn absichtlich nie vergessen wollen","Weil er den Bewertungsrahmen für alle folgenden Informationen unbewusst vorprägt","Weil das gesetzlich geregelt ist","Er ist tatsächlich genauso leicht korrigierbar wie ein positiver"], correct: 1 }
      ],
      open: { id:"b1-open", prompt: "Du kommst durch einen Stau 8 Minuten zu spät zu einem wichtigen Erstgespräch. Wie gestaltest du die ersten 60 Sekunden, um den Schaden am ersten Eindruck möglichst gering zu halten?", keyPoints:["Kurze, klare Entschuldigung ohne übertriebene Rechtfertigung","Schnell zum eigentlichen Thema/Nutzen für den Kunden überleiten","Souveränität statt Nervosität ausstrahlen","Keine Ausreden, die unglaubwürdig wirken könnten"] }
    },
    {
      id: "b2", title: "Rapport & Aktives Zuhören",
      theory: "Rapport entsteht u.a. durch dezentes Mirroring (Spiegeln von Tempo und Tonfall) und echtes aktives Zuhören. Die SPIN-Fragetechnik (Situation, Problem, Implikation, Need-payoff) hilft, Bedarf durch Fragen statt Behauptungen herauszuarbeiten.\n\nAktives Zuhören bedeutet mehr als Schweigen: Es umfasst gezieltes Nachfragen, kurzes Zusammenfassen des Gehörten und sichtbares Eingehen auf das, was der Kunde tatsächlich sagt – nicht auf das, was der Verkäufer als Nächstes sagen will.",
      mc: [
        { q: "Was bewirkt dezentes Mirroring im Gespräch?", options: ["Es wirkt immer manipulativ und sollte vermieden werden","Es baut unbewusst Vertrauen und Verbundenheit auf","Es hat nur bei Videocalls einen Effekt","Es funktioniert nur bei gleichem Geschlecht"], correct: 1 },
        { q: "Wofür steht das \"P\" in der SPIN-Fragetechnik?", options: ["Preis","Problem","Präsentation","Priorität"], correct: 1 },
        { q: "Was ist der Kern von aktivem Zuhören?", options: ["Möglichst schnell die eigene Antwort vorbereiten","Dem Gesprächspartner ins Wort fallen, um Tempo zu zeigen","Wirklich zuhören, nachfragen und das Gehörte kurz spiegeln","Nur nonverbal nicken, ohne zu sprechen"], correct: 2 },
        { q: "Eine \"Need-payoff\"-Frage (SPIN) zielt darauf ab, dass der Kunde...", options: ["...den Preis nennt","...selbst den Nutzen einer Lösung formuliert","...ein Konkurrenzprodukt bewertet","...das Gespräch beendet"], correct: 1 },
        { q: "Was unterscheidet aktives Zuhören von reinem Schweigen?", options: ["Es gibt keinen Unterschied","Aktives Zuhören umfasst gezieltes Nachfragen und Zusammenfassen, nicht nur Stille","Aktives Zuhören bedeutet, den Kunden zu unterbrechen","Es ist nur bei schriftlicher Kommunikation relevant"], correct: 1 },
        { q: "Eine \"Implikations\"-Frage (SPIN) fragt typischerweise nach:", options: ["Den konkreten Auswirkungen eines unadressierten Problems","Dem Budget des Kunden","Der Firmengröße des Kunden","Dem Liefertermin"], correct: 0 }
      ],
      open: { id:"b2-open", prompt: "Ein Kunde erzählt ausführlich von einem Problem in der Logistik, ohne dass ein klarer Bedarf erkennbar wird. Formuliere eine Situation-, eine Problem-, eine Implikations- und eine Need-payoff-Frage (SPIN), die du in dieser Reihenfolge stellen würdest.", keyPoints:["Situation-Frage erfasst neutral den Ist-Zustand", "Problem-Frage identifiziert die konkrete Schwierigkeit", "Implikations-Frage macht die Konsequenzen des Problems spürbar", "Need-payoff-Frage lässt den Kunden selbst den Nutzen einer Lösung formulieren"] }
    },
    {
      id: "b3", title: "Körpersprache & Stimme",
      theory: "Worte transportieren Inhalt, Stimme und Körpersprache transportieren Haltung. Bei Widersprüchen (Inkongruenz) vertraut das Gegenüber unbewusst eher dem nonverbalen Signal als den Worten.\n\nGerade am Telefon oder in Videocalls, wo Körpersprache eingeschränkt sichtbar ist, gewinnt die Stimme überproportional an Bedeutung: Tempo, Tonhöhe und Pausen ersetzen dort einen Großteil dessen, was sonst die Körpersprache leistet.",
      mc: [
        { q: "Ein Kunde verschränkt zunehmend die Arme. Was ist die sinnvollste Reaktion?", options: ["Ignorieren und weiter argumentieren","Innehalten, offene Fragen stellen, Bedenken aktiv ansprechen","Lauter und schneller sprechen","Sofort einen Rabatt anbieten"], correct: 1 },
        { q: "Welche stimmliche Eigenschaft wirkt meist am glaubwürdigsten?", options: ["Sehr schnelles, monotones Sprechen","Ruhiges Tempo mit natürlicher Betonung und Pausen","Durchgehend leise und zögerlich","Ununterbrochenes Sprechen ohne Pausen"], correct: 1 },
        { q: "Warum ist Kongruenz zwischen Worten und Körpersprache wichtig?", options: ["Sie ist irrelevant, nur Inhalt zählt","Widersprüche untergraben unbewusst die Glaubwürdigkeit","Sie betrifft nur den Verkäufer, nicht den Kunden","Sie zählt nur bei Präsentationen"], correct: 1 },
        { q: "Was signalisiert eine plötzlich höhere, schnellere Stimme oft?", options: ["Erhöhte Kompetenz","Nervosität oder Unsicherheit","Automatisch mehr Überzeugungskraft","Nichts, Stimme ist irrelevant"], correct: 1 },
        { q: "Warum gewinnt die Stimme am Telefon überproportional an Bedeutung?", options: ["Weil Körpersprache dort kaum sichtbar ist und die Stimme einen Großteil davon ersetzt","Weil Telefonate grundsätzlich kürzer sind","Weil Kunden am Telefon weniger aufmerksam zuhören","Stimme spielt am Telefon keine größere Rolle als sonst"], correct: 0 },
        { q: "Bewusste Sprechpausen im Verkaufsgespräch wirken meist:", options: ["Unsicher und sollten vermieden werden","Souverän und geben dem Gesagten Gewicht","Nur bei Präsentationen sinnvoll","Verwirrend für den Kunden"], correct: 1 }
      ],
      open: { id:"b3-open", prompt: "Du merkst am Telefon, dass der Kunde plötzlich einsilbig antwortet und die Stimme angespannter klingt. Wie passt du dein eigenes stimmliches Verhalten und deine nächsten Fragen an, um das Gespräch wieder zu öffnen?", keyPoints:["Erkennt das Signal als möglichen Widerstand oder Unsicherheit", "Reduziert eigenes Tempo, sucht bewusst ruhigeren Tonfall", "Stellt eine offene, nicht-konfrontative Frage statt weiterzuargumentieren", "Vermeidet, den Kunden zu bedrängen oder zu überreden"] }
    }
  ]
},
{
  id: "ueberzeugung", title: "Überzeugungsprinzipien", accent: "#7B2FF7",
  desc: "Die sechs Prinzipien nach Cialdini gezielt einsetzen.",
  examCase: { id:"ueberzeugung-exam", prompt: "Du präsentierst einem mittelständischen Unternehmen ein neues Software-Angebot. Plane eine kurze Präsentation (in Stichpunkten), die bewusst mindestens drei verschiedene Cialdini-Prinzipien kombiniert einsetzt. Nenne die Prinzipien explizit und erkläre je einen konkreten Satz/eine Maßnahme dazu.", keyPoints:["Nennt mindestens drei unterschiedliche Cialdini-Prinzipien korrekt","Gibt für jedes Prinzip ein konkretes, plausibles Beispiel","Prinzipien passen inhaltlich zusammen, wirken nicht beliebig aneinandergereiht","Bleibt dabei glaubwürdig, keine erfundenen Fakten oder übertriebene Behauptungen"] },
  modules: [
    {
      id: "u1", title: "Reziprozität",
      theory: "Wer zuerst gibt – Wissen, Zeit, einen kleinen Vorteil – erzeugt beim Gegenüber unbewusst das Bedürfnis, etwas zurückzugeben. Das funktioniert nur, wenn die Vorleistung echt und ohne sofortige Gegenforderung erfolgt.\n\nReziprozität lässt sich leicht überstrapazieren: Wird die Vorleistung zu offensichtlich als Verkaufstaktik erkennbar, kippt der Effekt ins Gegenteil und erzeugt Misstrauen statt Dankbarkeit.",
      mc: [
        { q: "Ein Kunde stimmt eher zu, nachdem er zuvor kostenlos eine individuelle Beratung erhielt. Welches Prinzip wirkt?", options: ["Knappheit","Reziprozität","Autorität","Konsistenz"], correct: 1 },
        { q: "Was ist Voraussetzung, damit Reziprozität wirkt?", options: ["Die Vorleistung muss möglichst teuer sein","Die Vorleistung muss echt sein, ohne sofortige Gegenforderung","Sie funktioniert nur bei Neukunden","Sie muss schriftlich fixiert werden"], correct: 1 },
        { q: "Welches Beispiel nutzt Reziprozität?", options: ["\"Nur noch heute verfügbar\"","Kostenlose Muster oder ein unaufgefordertes Extra vorab anbieten","Eine Kundenreferenz zeigen","Den teuersten Preis zuerst nennen"], correct: 1 },
        { q: "Warum funktioniert übertriebene, aufdringliche Reziprozität oft nicht?", options: ["Sie wirkt dann als Druckmittel und erzeugt Reaktanz statt Dankbarkeit","Reziprozität funktioniert immer, unabhängig von der Dosierung","Sie ist gesetzlich verboten","Kunden merken sie nie"], correct: 0 },
        { q: "Was passiert, wenn eine Vorleistung offensichtlich als reine Verkaufstaktik erkennbar ist?", options: ["Der Reziprozitätseffekt bleibt unverändert stark","Der Effekt kann sich umkehren und Misstrauen erzeugen","Kunden reagieren dann besonders positiv","Es hat generell keinen messbaren Effekt"], correct: 1 },
        { q: "Welche Vorleistung ist am ehesten glaubwürdig?", options: ["Eine, die erkennbar unmittelbar an eine Kaufforderung gekoppelt ist","Eine, die auch ohne jede Kaufabsicht des Kunden gegeben würde","Eine, die nur bei sehr großen Bestellungen gilt","Eine, die nachträglich in Rechnung gestellt wird"], correct: 1 }
      ],
      open: { id:"u1-open", prompt: "Du überlegst, einem noch unentschlossenen Interessenten vorab eine kostenlose, individuelle Kurzanalyse seines aktuellen Setups anzubieten. Wie formulierst du dieses Angebot, damit es als echte Vorleistung wirkt und nicht als durchsichtige Verkaufstaktik?", keyPoints:["Formuliert das Angebot ohne sofortige Gegenforderung oder Kaufdruck","Macht den eigenständigen Wert der Analyse für den Kunden deutlich, unabhängig vom Kauf","Bleibt konkret statt vage", "Vermeidet Formulierungen, die wie ein verstecktes Verkaufsversprechen wirken"] }
    },
    {
      id: "u2", title: "Knappheit",
      theory: "Begrenzte Verfügbarkeit erhöht den wahrgenommenen Wert eines Angebots – unabhängig vom tatsächlichen Nutzen. Wichtig: Die Knappheit muss real sein, sonst kippt sie in Manipulation.\n\nAm glaubwürdigsten wirkt Knappheit, wenn sie konkret und nachvollziehbar begründet ist – etwa durch tatsächliche Kapazitätsgrenzen oder echte Fristen – statt als pauschale, wiederholt genutzte Floskel.",
      mc: [
        { q: "\"Nur noch 2 Plätze verfügbar\" nutzt welches Prinzip?", options: ["Soziale Bewährtheit","Sympathie","Knappheit","Reziprozität"], correct: 2 },
        { q: "Warum erhöht Knappheit den wahrgenommenen Wert?", options: ["Weil seltene Dinge unbewusst als wertvoller eingeschätzt werden","Weil sie die Produktqualität objektiv verändert","Weil sie den Preis senkt","Sie hat keinen echten psychologischen Effekt"], correct: 0 },
        { q: "Was passiert, wenn Knappheit erkennbar erfunden ist?", options: ["Sie wirkt trotzdem gleich stark","Vertrauen sinkt, der Effekt kehrt sich um","Kunden kaufen automatisch mehr","Nichts, es ist irrelevant"], correct: 1 },
        { q: "Welche Form von Knappheit ist am glaubwürdigsten?", options: ["Zeitlich und mengenmäßig konkret und nachvollziehbar begründet","Immer und bei jedem Produkt gleich formuliert","Ohne jede Begründung, einfach behauptet","Nur mündlich, nie schriftlich"], correct: 0 },
        { q: "Warum wirkt eine wiederholt genutzte, pauschale Knappheits-Floskel irgendwann schwächer?", options: ["Kunden gewöhnen sich daran und durchschauen das Muster","Sie wird durch häufige Nutzung automatisch glaubwürdiger","Wiederholung hat keinerlei Einfluss auf die Wirkung","Knappheit verstärkt sich mit jeder Wiederholung"], correct: 0 },
        { q: "Echte, kapazitätsbasierte Knappheit unterscheidet sich von erfundener Knappheit dadurch, dass sie:", options: ["Nur bei sehr teuren Produkten überhaupt existiert","Für den Kunden nachprüfbar und nachvollziehbar ist","Immer mündlich, nie schriftlich kommuniziert wird","Keinen Effekt auf die Kaufentscheidung hat"], correct: 1 }
      ],
      open: { id:"u2-open", prompt: "Dein Unternehmen hat für ein neues Produkt tatsächlich nur eine begrenzte erste Charge produziert. Wie kommunizierst du diese echte Knappheit gegenüber einem zögernden Kunden, ohne wie eine plumpe Verkaufsfloskel zu wirken?", keyPoints:["Nennt eine konkrete, nachprüfbare Zahl oder Frist statt vager Behauptungen","Begründet die Knappheit sachlich (z.B. Produktionskapazität)","Übt keinen unangemessenen Druck aus","Lässt dem Kunden trotzdem echten Entscheidungsraum"] }
    },
    {
      id: "u3", title: "Autorität & Soziale Bewährtheit",
      theory: "Erkennbare Fachkompetenz erhöht die Überzeugungskraft einer Aussage deutlich (Autorität). Soziale Bewährtheit nutzt, dass Menschen sich am Verhalten anderer orientieren – Referenzen und Nutzerzahlen wirken als sozialer Beweis.\n\nAm stärksten wirken beide Prinzipien kombiniert mit Spezifität: eine konkrete, nachprüfbare Zahl oder ein konkretes Zertifikat überzeugt mehr als eine pauschale Behauptung wie \"wir sind Marktführer\".",
      mc: [
        { q: "Warum wirken Kundenreferenzen und Testimonials so überzeugend?", options: ["Weil sie das Produkt objektiv technisch beschreiben","Weil Menschen sich am Verhalten anderer orientieren","Weil sie den Preis rechtfertigen","Weil sie gesetzlich vorgeschrieben sind"], correct: 1 },
        { q: "Welches Signal stärkt Autorität am glaubwürdigsten?", options: ["Ein lauter Tonfall","Nachvollziehbare Fachkompetenz, Zertifikate oder belegte Erfolge","Ein teurer Anzug allein","Häufiges Wiederholen der eigenen Meinung"], correct: 1 },
        { q: "\"Über 10.000 Kunden vertrauen bereits auf...\" nutzt welches Prinzip?", options: ["Autorität","Soziale Bewährtheit","Konsistenz","Reziprozität"], correct: 1 },
        { q: "Warum ist Autorität ohne Belege riskant?", options: ["Sie wirkt dann als reine Behauptung und verliert an Kraft","Sie funktioniert trotzdem immer gleich gut","Autorität braucht nie Belege","Belege verringern die Wirkung von Autorität"], correct: 0 },
        { q: "Welche Aussage ist überzeugender als \"Wir sind Marktführer\"?", options: ["\"Über 200 Unternehmen aus der Branche X nutzen aktuell unsere Lösung\"","\"Wir sind sehr erfolgreich\"","\"Jeder kennt uns\"","\"Wir sind schon lange am Markt\""], correct: 0 },
        { q: "Soziale Bewährtheit wirkt tendenziell am stärksten, wenn die Referenzpersonen...", options: ["...möglichst anonym bleiben","...dem eigenen Kunden in Branche oder Situation ähnlich sind","...prominent, aber branchenfremd sind","...nie konkret genannt werden"], correct: 1 }
      ],
      open: { id:"u3-open", prompt: "Ein technisch versierter Kunde zweifelt an, dass dein Produkt wirklich so zuverlässig ist wie behauptet. Du hast Zugriff auf Kundenreferenzen und ein unabhängiges Testzertifikat. Wie baust du beides so ins Gespräch ein, dass es überzeugend statt aufgesetzt wirkt?", keyPoints:["Nutzt konkrete, spezifische Referenzen statt pauschaler Aussagen","Bringt das Zertifikat als nachprüfbaren, unabhängigen Beleg ein","Wählt Referenzen, die zur Situation/Branche des Kunden passen", "Wirkt sachlich, nicht wie plumpes Eigenlob"] }
    },
    {
      id: "u4", title: "Konsistenz & Commitment",
      theory: "Menschen wollen zu früheren Aussagen und Handlungen konsistent bleiben. Ein Kunde, der zuvor öffentlich zugestimmt hat, dass ein Problem ihn betrifft, kauft später eher die passende Lösung.\n\nJe kleiner und freiwilliger eine erste Zusage ist, desto wirksamer entfaltet sich später der Konsistenzdruck – erzwungene oder zu große erste Zusagen wirken dagegen oft kontraproduktiv.",
      mc: [
        { q: "Ein Kunde sagt zuvor \"Ja, das Problem betrifft uns auch\" und kauft später eher die Lösung dafür. Welches Prinzip erklärt das?", options: ["Autorität","Konsistenz (Commitment)","Knappheit","Sympathie"], correct: 1 },
        { q: "Warum sind kleine, freiwillige Zusagen zu Beginn eines Gesprächs wirksam?", options: ["Sie verpflichten rechtlich zum Kauf","Sie schaffen ein psychologisches Bedürfnis, spätere Handlungen konsistent dazu zu halten","Sie haben keinen messbaren Effekt","Sie funktionieren nur schriftlich"], correct: 1 },
        { q: "Welche Frage nutzt das Konsistenzprinzip sinnvoll?", options: ["\"Wollen Sie jetzt sofort unterschreiben?\"","\"Wäre es für Sie wichtig, dieses Problem zu lösen?\" (mit Ja-Antwort davor)","\"Wie viel Budget haben Sie?\"","\"Kennen Sie unsere Konkurrenz?\""], correct: 1 },
        { q: "Was ist eine Gefahr bei übertriebenem Einsatz von Commitment-Fragen?", options: ["Sie wirken schnell durchschaubar und erzeugen Widerstand","Sie funktionieren immer, egal wie oft eingesetzt","Sie sind gesetzlich reguliert","Sie haben keine Nachteile"], correct: 0 },
        { q: "Warum wirkt eine erzwungene, zu große erste Zusage oft kontraproduktiv?", options: ["Sie wird vom Kunden als unfreiwillig erlebt und erzeugt Reaktanz statt Konsistenzdruck","Erzwungene Zusagen wirken immer stärker als freiwillige","Sie haben keinerlei Nachteil gegenüber kleinen Zusagen","Konsistenz funktioniert nur bei erzwungenen Zusagen"], correct: 0 },
        { q: "Konsistenz wirkt psychologisch deshalb so stark, weil Menschen...", options: ["...sich selbst und anderen gegenüber als widersprüchlich erscheinen wollen","...ein starkes Bedürfnis haben, mit früheren Aussagen und Handlungen übereinzustimmen","...grundsätzlich jede Entscheidung sofort vergessen","...Konsistenz nur bei schriftlichen Zusagen zeigen"], correct: 1 }
      ],
      open: { id:"u4-open", prompt: "Zu Beginn eines Gesprächs hat der Kunde zugestimmt, dass ineffiziente Prozesse ihn jährlich Zeit und Geld kosten. Wie knüpfst du am Ende des Gesprächs an diese frühere Zusage an, um zum Abschluss zu kommen – ohne dass es wie ein billiger Trick wirkt?", keyPoints:["Bezieht sich explizit und konkret auf die frühere Aussage des Kunden", "Verbindet sie logisch mit dem jetzt vorgeschlagenen nächsten Schritt", "Formuliert es als natürliche Konsequenz, nicht als Falle", "Lässt dem Kunden weiterhin echte Entscheidungsfreiheit"] }
    }
  ]
},
{
  id: "verzerrung", title: "Kognitive Verzerrungen", accent: "#FF4D6D",
  desc: "Denkfehler verstehen, die Entscheidungen unbewusst lenken.",
  examCase: { id:"verzerrung-exam", prompt: "Ein Kunde vergleicht dein Angebot (120€/Monat) mit einem viel günstigeren Konkurrenzangebot (60€/Monat) und sagt: \"Warum sollte ich doppelt so viel zahlen?\" Nutze in deiner Antwort bewusst mindestens zwei kognitive Verzerrungen (z.B. Framing, Kontrastprinzip, Verlustaversion) und erkläre kurz, welche du wo einsetzt.", keyPoints:["Nutzt erkennbar mindestens zwei unterschiedliche kognitive Verzerrungen","Wendet sie konkret auf den Preisvergleich an, nicht abstrakt","Bleibt bei wahrheitsgemäßen, nicht manipulativen Aussagen","Antwort ist eine plausible, direkt einsetzbare Gesprächsformulierung"] },
  modules: [
    {
      id: "v1", title: "Ankereffekt & Framing",
      theory: "Die zuerst genannte Zahl prägt die Bewertung aller folgenden Zahlen (Ankereffekt). Framing beschreibt, dass dieselbe Information je nach Formulierung unterschiedlich wirkt – z.B. \"90% Erfolgsquote\" vs. \"10% Fehlerquote\".\n\nBeide Effekte wirken selbst dann, wenn die beteiligten Personen den Mechanismus kennen – Wissen um den Effekt schützt kaum davor, ihn bei sich selbst zu bemerken.",
      mc: [
        { q: "Ein Verkäufer nennt zuerst den teuersten Preis, danach wirkt das mittlere Angebot günstig. Welcher Effekt liegt vor?", options: ["Ankereffekt","Bestätigungsfehler","Halo-Effekt","Verlustaversion"], correct: 0 },
        { q: "\"90% Erfolgsquote\" statt \"10% Fehlerquote\" zu sagen ist ein Beispiel für:", options: ["Framing-Effekt","Ankereffekt","Priming","Autoritätsprinzip"], correct: 0 },
        { q: "Warum wirkt der Ankereffekt auch, wenn die erste Zahl willkürlich war?", options: ["Weil das Gehirn nachfolgende Bewertungen unbewusst am ersten Wert ausrichtet","Weil Kunden Zahlen grundsätzlich ignorieren","Er wirkt nur bei sehr hohen Beträgen","Er wirkt nur bei Rabattaktionen"], correct: 0 },
        { q: "Welche Formulierung nutzt Framing zugunsten des Angebots?", options: ["\"Das kostet Sie 50€ im Monat\"","\"Das kostet Sie nur 1,60€ am Tag\"","\"Der Preis steht fest\"","\"Fragen Sie die Konkurrenz\""], correct: 1 },
        { q: "Schützt das Wissen um den Ankereffekt zuverlässig davor, selbst davon beeinflusst zu werden?", options: ["Ja, vollständig","Nein, der Effekt wirkt oft trotz Kenntnis des Mechanismus","Nur bei sehr hohen Summen","Nur bei schriftlichen Angeboten"], correct: 1 },
        { q: "Zwei identische Erfolgsquoten werden unterschiedlich formuliert präsentiert und wirken beim Kunden unterschiedlich überzeugend. Das ist ein Beispiel für:", options: ["Framing-Effekt","Verfügbarkeitsheuristik","Reziprozität","Autoritätsprinzip"], correct: 0 }
      ],
      open: { id:"v1-open", prompt: "Du sollst ein Angebot präsentieren, das monatlich 180€ kostet. Formuliere zwei unterschiedliche Framings dieses Preises – eines eher nüchtern, eines möglichst günstig wirkend – und erkläre kurz, warum das zweite psychologisch wirksamer sein kann.", keyPoints:["Bietet zwei erkennbar unterschiedliche, sinnvolle Framings an (z.B. Tageskosten vs. Monatskosten)","Erklärt den psychologischen Mechanismus dahinter korrekt","Bleibt dabei bei wahrheitsgemäßen Zahlen, keine Verzerrung der Fakten","Erkennt Grenzen: Framing ersetzt keinen echten Mehrwert"] }
    },
    {
      id: "v2", title: "Verlustaversion",
      theory: "Ein potenzieller Verlust wiegt psychologisch etwa doppelt so schwer wie ein gleich großer Gewinn. \"Verpassen Sie nicht die Chance, 500€ zu sparen\" wirkt deshalb oft stärker als \"Sparen Sie 500€\".\n\nVerlustaversion lässt sich besonders wirksam mit Konkretheit kombinieren: Ein konkret benannter, nachvollziehbarer Verlust (z.B. entgangene Zeitersparnis pro Woche) wirkt stärker als eine vage formulierte Gefahr.",
      mc: [
        { q: "Warum wirkt \"Verpassen Sie nicht 500€ zu sparen\" oft stärker als \"Sparen Sie 500€\"?", options: ["Weil Verluste psychologisch stärker wiegen als gleich große Gewinne","Weil der Satz kürzer ist","Weil es eine offene Frage ist","Weil es den Ankereffekt nutzt"], correct: 0 },
        { q: "Verlustaversion lässt sich am ehesten nutzen, indem man...", options: ["...ausschließlich über Zusatzkosten spricht","...aufzeigt, was der Kunde ohne die Lösung konkret verliert oder verpasst","...den Preis mehrfach wiederholt","...das Gespräch abkürzt"], correct: 1 },
        { q: "Was ist eine Gefahr bei übertriebener Nutzung von Verlustaversion?", options: ["Sie wirkt dann als Angstmache und schadet dem Vertrauen","Sie hat keine Nebenwirkungen","Sie funktioniert nur bei B2C","Kunden reagieren nie darauf"], correct: 0 },
        { q: "Verlustaversion beschreibt, dass Menschen...", options: ["...Gewinne stärker gewichten als Verluste","...Verluste etwa doppelt so stark gewichten wie gleich große Gewinne","...Gewinne und Verluste immer gleich bewerten","...nur bei großen Summen reagieren"], correct: 1 },
        { q: "Welche Formulierung nutzt Verlustaversion am konkretesten?", options: ["\"Ohne diese Lösung verlieren Sie im Schnitt 3 Stunden pro Woche durch manuelle Nacharbeit\"","\"Unsere Lösung ist sehr gut\"","\"Viele Kunden sind zufrieden\"","\"Der Preis ist wettbewerbsfähig\""], correct: 0 },
        { q: "Warum wirkt eine vage formulierte Verlust-Warnung schwächer als eine konkrete?", options: ["Vage Formulierungen sind für das Gehirn schwerer greifbar und weniger emotional wirksam","Vage Formulierungen wirken immer stärker als konkrete","Konkretheit hat keinen Einfluss auf die Wirkung","Verlustaversion wirkt nur bei sehr hohen Beträgen"], correct: 0 }
      ],
      open: { id:"v2-open", prompt: "Ein Kunde zögert bei einer Entscheidung, die ihm nachweislich pro Monat mehrere Stunden manuelle Arbeit erspart. Formuliere einen Satz, der Verlustaversion konkret und glaubwürdig nutzt, um den Nutzen der Entscheidung zu verdeutlichen — ohne in Angstmache zu kippen.", keyPoints:["Nutzt eine konkrete, nachvollziehbare Zahl statt vager Formulierung","Bleibt sachlich, keine übertriebene Dramatisierung", "Fokus liegt auf dem tatsächlichen Verlust bei Nicht-Handeln", "Formulierung bleibt glaubwürdig und nicht manipulativ"] }
    },
    {
      id: "v3", title: "Priming, Verfügbarkeit & Bestätigungsfehler",
      theory: "Priming: vorausgehende Reize beeinflussen unbewusst spätere Bewertungen. Verfügbarkeitsheuristik: leicht erinnerbare Ereignisse werden als wahrscheinlicher eingeschätzt. Bestätigungsfehler: einmal gefasste Meinungen werden bevorzugt bestätigt, widersprechende Infos eher ignoriert.\n\nAlle drei Effekte erklären, warum Kunden manchmal an einer offensichtlich überholten Meinung festhalten: Ein einzelnes einprägsames Negativerlebnis (Verfügbarkeit) wird durch selektive Wahrnehmung (Bestätigungsfehler) immer weiter untermauert.",
      mc: [
        { q: "Ein Kunde überschätzt ein Ausfallrisiko, weil er kürzlich einen Bericht darüber las. Welcher Effekt liegt vor?", options: ["Verfügbarkeitsheuristik","Ankereffekt","Reziprozität","Framing-Effekt"], correct: 0 },
        { q: "Ein Kunde ignoriert unbewusst Informationen, die seiner bereits gefällten Kaufentscheidung widersprechen. Wie heißt das?", options: ["Bestätigungsfehler","Ankereffekt","Framing-Effekt","Autoritätsprinzip"], correct: 0 },
        { q: "Ein Verkäufer erwähnt beiläufig \"Sicherheit\", bevor er über Garantien spricht. Welcher Effekt ist das?", options: ["Priming","Verlustaversion","Konsistenzprinzip","Halo-Effekt"], correct: 0 },
        { q: "Wie kann man dem Bestätigungsfehler eines Kunden konstruktiv begegnen?", options: ["Ihn ignorieren und einfach weiterreden","Widersprechende Fakten sanft, mit Belegen und ohne Konfrontation einbringen","Den Kunden direkt korrigieren und belehren","Das Thema komplett vermeiden"], correct: 1 },
        { q: "Warum hält ein Kunde manchmal an einer veralteten negativen Meinung über ein Produkt fest?", options: ["Ein einprägsames Negativerlebnis wird durch selektive Wahrnehmung fortlaufend bestätigt","Kunden ändern ihre Meinung grundsätzlich nie mehr","Es liegt immer an mangelnder Intelligenz des Kunden","Negative Meinungen sind grundsätzlich rational begründet"], correct: 0 },
        { q: "Welche Aussage über die Verfügbarkeitsheuristik ist korrekt?", options: ["Sie beschreibt, dass Verfügbarkeit eines Produkts den Preis bestimmt","Sie beschreibt, dass leicht erinnerbare Ereignisse als wahrscheinlicher eingeschätzt werden als sie tatsächlich sind","Sie hat nichts mit Erinnerung zu tun","Sie wirkt nur bei technischen Produkten"], correct: 1 }
      ],
      open: { id:"v3-open", prompt: "Ein Kunde sagt: \"Ich hab mal gelesen, dass solche Systeme ständig ausfallen\" – obwohl aktuelle Daten das Gegenteil zeigen. Wie sprichst du den Bestätigungsfehler und die Verfügbarkeitsheuristik hier konstruktiv an, ohne den Kunden bloßzustellen?", keyPoints:["Nimmt die Sorge des Kunden ernst statt sie abzutun","Bringt aktuelle, nachprüfbare Daten sanft ein, ohne zu belehren","Vermeidet direkte Konfrontation oder Korrektur \"von oben herab\"","Schafft Raum, dass der Kunde seine Meinung selbst revidieren kann"] }
    },
    {
      id: "v4", title: "Kontrastprinzip",
      theory: "Eine Option wirkt attraktiver, je nachdem, womit sie unmittelbar zuvor verglichen wird. Ein teures Premium-Paket zuerst zu zeigen lässt das eigentliche Zielangebot günstiger erscheinen.\n\nDas Kontrastprinzip funktioniert nicht nur bei Preisen, sondern auch bei Leistungsumfang, Zeitaufwand oder Komplexität – jede Dimension, die vergleichbar ist, kann als Kontrastfolie genutzt werden.",
      mc: [
        { q: "Ein Verkäufer zeigt zuerst ein sehr teures Premium-Paket, bevor er das Zielangebot präsentiert. Welches Prinzip nutzt er?", options: ["Kontrastprinzip","Reziprozität","Zeigarnik-Effekt","Halo-Effekt"], correct: 0 },
        { q: "Warum wirkt ein mittleres Angebot oft attraktiver, wenn ein teureres daneben steht?", options: ["Weil der Vergleich es relativ günstiger erscheinen lässt","Weil Kunden immer das billigste Angebot wählen","Weil es das einzig verfügbare ist","Der Effekt existiert nicht nachweisbar"], correct: 0 },
        { q: "Das Kontrastprinzip funktioniert am besten, wenn...", options: ["...nur ein einziges Angebot gezeigt wird","...die Vergleichsoption unmittelbar vorher präsentiert wird","...der Kunde die Vergleichsoption nie sieht","...alle Optionen identisch bepreist sind"], correct: 1 },
        { q: "Welches Beispiel nutzt das Kontrastprinzip?", options: ["Zuerst das Enterprise-Paket für 999€ zeigen, dann das Standard-Paket für 199€","Nur ein einziges Preisschild zeigen","Einen Rabattcode verschicken","Eine Kundenreferenz vorlesen"], correct: 0 },
        { q: "Das Kontrastprinzip kann außer beim Preis auch genutzt werden bei:", options: ["Ausschließlich bei numerischen Werten wie dem Preis","Auch bei Leistungsumfang, Zeitaufwand oder Komplexität im Vergleich", "Es funktioniert nur bei physischen Produkten","Nur bei schriftlichen Angeboten"], correct: 1 },
        { q: "Warum ist die Reihenfolge der Präsentation beim Kontrastprinzip entscheidend?", options: ["Die Reihenfolge hat keinen Einfluss auf die Wahrnehmung","Nur die zuerst gezeigte Option dient als Vergleichsmaßstab für die danach gezeigte","Es ist besser, immer das günstigste Angebot zuerst zu zeigen","Reihenfolge spielt nur bei mündlichen Angeboten eine Rolle"], correct: 1 }
      ],
      open: { id:"v4-open", prompt: "Du hast drei Pakete: Basic (49€), Standard (99€, dein eigentliches Zielangebot), Premium (249€). In welcher Reihenfolge präsentierst du sie einem Kunden und warum nutzt diese Reihenfolge das Kontrastprinzip optimal?", keyPoints:["Wählt eine Reihenfolge, die Premium vor Standard zeigt (oder begründet bewusst eine Alternative)","Erklärt den Kontrasteffekt korrekt anhand des Beispiels","Berücksichtigt, dass die Reihenfolge das Zielangebot (Standard) attraktiver wirken lassen soll","Bleibt bei einer nachvollziehbaren, nicht manipulativen Begründung"] }
    }
  ]
},
{
  id: "einwand", title: "Einwände & Verhandlung", accent: "#00E5C7",
  desc: "Widerstände psychologisch fundiert auflösen und zum Abschluss führen.",
  examCase: { id:"einwand-exam", prompt: "Ein Kunde bringt in einem Gespräch nacheinander drei Einwände: \"Zu teuer\", \"Wir haben schon einen Anbieter\", \"Ich muss das erst intern abstimmen\". Beschreibe für jeden der drei Einwände kurz dein Vorgehen (anerkennen → verstehen → reframen → bestätigen) und wie du am Ende einen konkreten nächsten Schritt vereinbarst.", keyPoints:["Behandelt alle drei Einwände einzeln und angemessen unterschiedlich","Wendet erkennbar die 4-Schritte-Struktur an, nicht nur pauschale Gegenargumente","Vermeidet Druck oder erfundene Dringlichkeit","Schließt mit einem konkreten, realistischen nächsten Schritt statt vagem Ausklang"] },
  modules: [
    {
      id: "e1", title: "Psychologie des Neins",
      theory: "Ablehnung ist oft keine endgültige Entscheidung, sondern ein Schutzreflex (Reaktanz-Theorie): Menschen wehren sich gegen wahrgenommenen Druck, um ihre Entscheidungsfreiheit zu bewahren. Wer das erkennt, reagiert nicht mit Gegendruck, sondern mit Verständnis und gezielten Fragen.\n\nEin frühes \"Nein\" ist häufig eher ein \"Nein zu diesem Moment/dieser Formulierung\" als ein endgültiges \"Nein zum Produkt\" – die Unterscheidung zu treffen entscheidet oft über den weiteren Gesprächsverlauf.",
      mc: [
        { q: "Was besagt die Reaktanz-Theorie im Verkaufskontext?", options: ["Kunden lehnen ab, um ihre wahrgenommene Entscheidungsfreiheit zu verteidigen","Kunden lehnen immer aus Preisgründen ab","Ablehnung ist immer endgültig","Reaktanz tritt nur bei teuren Produkten auf"], correct: 0 },
        { q: "Wie sollte man auf spürbaren Druck-Widerstand des Kunden am besten reagieren?", options: ["Mit mehr Druck und Dringlichkeit","Mit Verständnis, offenen Fragen, ohne den Druck zu erhöhen","Das Gespräch sofort beenden","Den Preis sofort senken"], correct: 1 },
        { q: "Ein erster Einwand ist häufig...", options: ["...eine endgültige Ablehnung","...ein Signal für fehlende Information oder Unsicherheit, kein finales Nein","...immer nur Preistaktik","...ein Zeichen von Desinteresse"], correct: 1 },
        { q: "Was ist der erste sinnvolle Schritt bei einem Einwand?", options: ["Sofort dagegen argumentieren","Den Einwand ernst nehmen und genauer verstehen wollen","Das Thema wechseln","Ein Sonderangebot anbieten"], correct: 1 },
        { q: "Warum ist die Unterscheidung zwischen \"Nein zum Moment\" und \"Nein zum Produkt\" wichtig?", options: ["Sie ist irrelevant, jedes Nein ist gleich zu behandeln","Sie bestimmt, ob weitere Klärung sinnvoll ist oder das Gespräch beendet werden sollte","Nur das \"Nein zum Produkt\" verdient eine Reaktion","Diese Unterscheidung existiert in der Praxis nicht"], correct: 1 },
        { q: "Ein Kunde reagiert gereizt auf eine als aufdringlich empfundene Frage. Was erklärt die Reaktanz-Theorie hier?", options: ["Der Kunde ist grundsätzlich unhöflich","Der Kunde verteidigt seine wahrgenommene Entscheidungsfreiheit gegen den empfundenen Druck","Der Kunde hat kein Interesse am Produkt","Reaktanz hat mit der Frage nichts zu tun"], correct: 1 }
      ],
      open: { id:"e1-open", prompt: "Ein Kunde sagt genervt: \"Nein, das brauche ich nicht\", nachdem du eine recht direkte Abschlussfrage gestellt hast. Wie reagierst du, um herauszufinden, ob es ein \"Nein zum Moment\" oder ein echtes \"Nein zum Produkt\" ist – ohne Druck zu erhöhen?", keyPoints:["Reagiert nicht mit Gegendruck oder Rechtfertigung", "Stellt eine offene, nicht wertende Nachfrage", "Gibt dem Kunden Raum, seine Position zu präzisieren","Bleibt ruhig und respektiert eine mögliche endgültige Ablehnung"] }
    },
    {
      id: "e2", title: "Einwandbehandlung mit Framing",
      theory: "Eine bewährte Struktur: Einwand anerkennen → verstehen (nachfragen) → mit Framing/Beispiel neu einordnen → Bestätigung einholen. Framing hilft, denselben Sachverhalt aus einem hilfreicheren Blickwinkel zu zeigen, ohne den Einwand zu ignorieren.\n\nDiese Struktur funktioniert nur, wenn jeder Schritt tatsächlich durchlaufen wird – wer direkt zum Reframing springt, ohne den Einwand vorher wirklich verstanden zu haben, wirkt schnell wie jemand, der nur eine Antwort abspult.",
      mc: [
        { q: "Was ist der erste Schritt der 4-Schritte-Einwandmethode?", options: ["Direkt widersprechen","Den Einwand anerkennen","Den Preis senken","Das Thema wechseln"], correct: 1 },
        { q: "Warum sollte man einen Einwand zuerst anerkennen, bevor man reagiert?", options: ["Es kostet Zeit ohne Nutzen","Es signalisiert Ernstnehmen und reduziert Reaktanz, bevor man neu einordnet","Es ist rechtlich vorgeschrieben","Anerkennen schwächt die eigene Position"], correct: 1 },
        { q: "Reframing eines Preiseinwands bedeutet z.B.:", options: ["Den Preis ignorieren","Den Preis in Bezug zum langfristigen Nutzen/Tageskosten setzen","Sofort einen Rabatt geben","Den Kunden zur Konkurrenz schicken"], correct: 1 },
        { q: "Warum ist eine Bestätigung am Ende der Einwandbehandlung wichtig?", options: ["Sie ist optional und meist überflüssig","Sie stellt sicher, dass der Einwand wirklich ausgeräumt ist, nicht nur übertönt","Sie verlängert nur das Gespräch","Sie ist nur bei schriftlichen Angeboten nötig"], correct: 1 },
        { q: "Was passiert, wenn man beim Reframing den Schritt \"verstehen/nachfragen\" überspringt?", options: ["Es wirkt schnell wie eine abgespulte Standardantwort statt echter Reaktion","Es hat keinerlei Nachteil","Es beschleunigt den Verkaufsprozess grundsätzlich positiv","Kunden bemerken das nie"], correct: 0 },
        { q: "Welche Reihenfolge entspricht der bewährten Einwandstruktur?", options: ["Anerkennen → Verstehen → Reframing → Bestätigung","Reframing → Anerkennen → Bestätigung → Verstehen","Bestätigung → Reframing → Anerkennen → Verstehen","Verstehen → Bestätigung → Anerkennen → Reframing"], correct: 0 }
      ],
      open: { id:"e2-open", prompt: "Ein Kunde sagt: \"Das ist mir ehrlich gesagt zu teuer für das, was es kann.\" Führe die vier Schritte (anerkennen, verstehen, reframen, bestätigen) an diesem konkreten Einwand exemplarisch durch — schreibe für jeden Schritt einen kurzen Beispielsatz.", keyPoints:["Anerkennt den Einwand ernsthaft statt ihn abzutun","Stellt eine echte Verständnisfrage, bevor reframed wird","Bietet ein sinnvolles, konkretes Reframing (z.B. Nutzen/Tageskosten)","Schließt mit einer echten Bestätigungsfrage ab, statt einfach weiterzureden"] }
    },
    {
      id: "e3", title: "Preisverhandlung",
      theory: "In Preisverhandlungen wirken Ankereffekt (wer zuerst eine Zahl nennt, prägt den Rahmen) und Verlustaversion (was der Kunde bei einem Nein verliert) besonders stark. Konzessionen sollten immer an eine Gegenleistung gekoppelt sein, sonst wirken sie als Schwäche.\n\nEine gute Verhandlungsvorbereitung definiert vorab die eigene Untergrenze und mögliche Gegenleistungen (z.B. längere Laufzeit, Referenz, schnellerer Abschluss) – so bleibt man auch unter Druck handlungsfähig, statt spontan zu viel nachzugeben.",
      mc: [
        { q: "Warum ist es meist vorteilhaft, in einer Preisverhandlung die erste Zahl selbst zu nennen?", options: ["Es ist unhöflich, das zu tun","Man setzt den Anker und prägt damit den Verhandlungsrahmen","Es hat keinen strategischen Effekt","Der Kunde erwartet das nicht"], correct: 1 },
        { q: "Ein Preisnachlass ohne Gegenleistung des Kunden wirkt oft als:", options: ["Zeichen von Großzügigkeit ohne Nebenwirkung","Zeichen von Schwäche, das weitere Forderungen provoziert","Neutral, ohne jede Wirkung","Zeichen von Autorität"], correct: 1 },
        { q: "Welche Formulierung koppelt eine Konzession sinnvoll an eine Gegenleistung?", options: ["\"Klar, 10% Rabatt kein Problem\"","\"Wenn wir uns heute auf den Abschluss einigen, kann ich Ihnen 10% anbieten\"","\"Der Preis steht nicht zur Debatte\"","\"Fragen Sie einfach die Konkurrenz\""], correct: 1 },
        { q: "Wie lässt sich Verlustaversion in einer Preisverhandlung konstruktiv einsetzen?", options: ["Konkret aufzeigen, was der Kunde durch ein Zögern/Nein tatsächlich verpasst","Drohungen aussprechen","Nur über den nackten Preis sprechen","Den Kunden ignorieren"], correct: 0 },
        { q: "Warum ist es sinnvoll, vor einer Preisverhandlung die eigene Untergrenze und mögliche Gegenleistungen festzulegen?", options: ["Damit man unter Druck nicht spontan zu viel nachgibt","Weil es gesetzlich vorgeschrieben ist","Weil Kunden das explizit erwarten zu hören","Es hat keinen praktischen Nutzen"], correct: 0 },
        { q: "Welche mögliche Gegenleistung kann ein Verkäufer für einen Preisnachlass anbieten lassen?", options: ["Eine längere Vertragslaufzeit oder eine Referenz","Es gibt grundsätzlich keine sinnvollen Gegenleistungen","Nur eine sofortige Empfehlung an Wettbewerber","Ausschließlich eine höhere Stückzahl ist denkbar"], correct: 0 }
      ],
      open: { id:"e3-open", prompt: "Ein Kunde fordert kurz vor Abschluss noch 15% Rabatt, sonst gehe er zur Konkurrenz. Deine intern festgelegte Untergrenze liegt bei maximal 8% Nachlass. Wie reagierst du in dieser Verhandlungssituation – formuliere deine Antwort konkret.", keyPoints:["Gibt nicht sofort auf die volle Forderung nach, bleibt aber lösungsorientiert","Koppelt einen möglichen Nachlass an eine Gegenleistung (z.B. Laufzeit, schneller Abschluss)","Bleibt innerhalb der eigenen Untergrenze","Wirkt selbstbewusst statt nachgiebig-ängstlich"] }
    }
  ]
},
{
  id: "kaltakquise", title: "Kaltakquise & Abschluss", accent: "#7B2FF7",
  desc: "Vom ersten Anruf bis zum sauberen Abschluss: Strategie, Gatekeeper, Closing.",
  examCase: { id:"kaltakquise-exam", prompt: "Du rufst einen Handwerksbetrieb an. Die Mitarbeiterin am Empfang fragt: \"Worum geht's denn, ich kann Sie auch einfach in ein Verzeichnis eintragen und der Chef ruft zurück, wenn Interesse besteht.\" Beschreibe dein konkretes Vorgehen: wie du die Empfangsperson nicht als Hindernis, sondern als Verbündete behandelst, und wie du trotzdem realistisch zum Entscheider durchkommst.", keyPoints:["Behandelt die Empfangsperson respektvoll, nicht als Hindernis, das umgangen werden muss","Nennt einen konkreten, glaubwürdigen Grund für den Rückruf statt vager Floskeln","Versucht eine niedrige Hürde zu setzen (kurzer Termin/Rückruf-Zeitfenster) statt sofortigen Abschluss zu erzwingen","Bleibt ehrlich darüber, was der Anruf bezweckt, statt zu verschleiern"] },
  modules: [
    {
      id: "k1", title: "Kaltakquise-Strategie",
      theory: "Erfolgreiche Kaltakquise beginnt vor dem ersten Klingeln: eine klare Zielgruppen-Definition (welche Betriebe, welche Größe, welche Region), eine Tagesstruktur mit fester Anrufzeit und ein realistisches Zahlenverständnis (wie viele Anwahlen führen im Schnitt zu wie vielen Terminen) verhindern Frust und ungezielte Streuverluste.\n\nDer Eröffnungssatz entscheidet über die ersten 5 Sekunden: Ein klarer, kurzer Aufhänger mit erkennbarem Grund für den Anruf funktioniert deutlich besser als eine lange Unternehmensvorstellung. Ziel des Erstanrufs ist selten der Sofort-Abschluss, sondern meist ein qualifizierter nächster Schritt (Termin, Rückruf, Interesse bestätigt).",
      mc: [
        { q: "Was sollte vor dem ersten Anruf einer Kaltakquise-Kampagne feststehen?", options: ["Nichts, spontanes Anrufen funktioniert am besten", "Eine klare Zielgruppen-Definition und ein realistisches Zahlenverständnis", "Nur die Telefonnummer", "Der finale Vertragstext"], correct: 1 },
        { q: "Warum ist eine feste tägliche Anrufzeit sinnvoll?", options: ["Sie ist gesetzlich vorgeschrieben", "Sie schafft Routine und macht Erfolg über Zeit messbar/vergleichbar", "Kunden erwarten das explizit", "Sie hat keinen echten Nutzen"], correct: 1 },
        { q: "Was ist meist das realistische Ziel eines Erstanrufs?", options: ["Der sofortige Vertragsabschluss", "Ein qualifizierter nächster Schritt wie ein Termin oder Rückruf", "Ausschließlich Produktinformationen vorzulesen", "Den Kunden zu einer Sofortzahlung zu bewegen"], correct: 1 },
        { q: "Wie sollte ein guter Eröffnungssatz idealerweise sein?", options: ["Möglichst lang und detailliert", "Kurz, klar, mit erkennbarem Grund für den Anruf", "Eine vollständige Firmenpräsentation", "Bewusst vage, um Neugier zu wecken"], correct: 1 },
        { q: "Warum hilft ein realistisches Zahlenverständnis (Anwahlen zu Terminen) gegen Frust?", options: ["Weil es Misserfolge als normalen Teil des Prozesses einordnet statt als persönliches Versagen", "Weil es den Preis rechtfertigt", "Es hat keinen psychologischen Effekt", "Weil dadurch weniger angerufen werden muss"], correct: 0 },
        { q: "Was zählt zu ungezielten Streuverlusten in der Kaltakquise?", options: ["Anrufe bei klar definierten Zielkunden", "Anrufe ohne jede Zielgruppen-Eingrenzung, wahllos aus dem Telefonbuch", "Ein strukturierter Tagesplan", "Ein vorbereiteter Gesprächsleitfaden"], correct: 1 }
      ],
      open: { id:"k1-open", prompt: "Du sollst eine neue Kaltakquise-Kampagne für eine Region starten. Beschreibe kurz, wie du Zielgruppe, Tagesstruktur und Erfolgsmessung dafür konkret aufsetzen würdest.", keyPoints: ["Definiert eine konkrete, eingegrenzte Zielgruppe statt 'alle anrufen'", "Schlägt eine feste, wiederholbare Tagesstruktur vor", "Nennt eine Art, Erfolg/Quote messbar zu machen", "Setzt ein realistisches, nicht überzogenes Erwartungsniveau"] }
    },
    {
      id: "k2", title: "Gatekeeper & Einstieg",
      theory: "Empfangspersonen und Assistenzen sind keine Hindernisse, sondern oft die Menschen, die am meisten Einfluss darauf haben, ob ein Rückruf überhaupt stattfindet. Respektvoller Umgang, ein klarer und ehrlicher Grund für den Anruf sowie eine niedrige Hürde (\"Passt es dem Chef besser vormittags oder nachmittags für einen kurzen Rückruf?\") erhöhen die Durchstellquote deutlich.\n\nTrickreiche Umgehungsversuche (bewusst falsche Angaben, Dringlichkeit vortäuschen) schaden dem Ruf und funktionieren auf Dauer schlechter als ein ehrlicher, sympathischer Ansatz, der die Gatekeeper-Person als Verbündete gewinnt statt als Gegner behandelt.",
      mc: [
        { q: "Wie sollte man Empfangspersonen/Gatekeeper idealerweise behandeln?", options: ["Als Hindernis, das man umgehen muss", "Als potenzielle Verbündete mit echtem Einfluss auf den Rückruf", "Komplett ignorieren und auf den Chef bestehen", "Nur mit Standardfloskeln abspeisen"], correct: 1 },
        { q: "Was erhöht typischerweise die Durchstellquote am ehesten?", options: ["Ein vager, unklarer Grund für den Anruf", "Ein klarer, ehrlicher Grund plus eine niedrige Hürde für den nächsten Schritt", "Druck und Ungeduld in der Stimme", "Eine erfundene Dringlichkeit"], correct: 1 },
        { q: "Warum schaden erfundene Dringlichkeiten gegenüber Gatekeepern langfristig?", options: ["Sie sind grundsätzlich wirkungslos", "Sie schaden dem Vertrauen/Ruf und funktionieren auf Dauer schlechter als Ehrlichkeit", "Sie sind gesetzlich verboten", "Sie beschleunigen immer den Abschluss"], correct: 1 },
        { q: "Welche Formulierung ist ein Beispiel für eine 'niedrige Hürde' im Gespräch mit dem Gatekeeper?", options: ["\"Ich muss unbedingt sofort mit dem Chef sprechen\"", "\"Passt es ihm eher vormittags oder nachmittags für einen kurzen Rückruf?\"", "\"Sagen Sie ihm, es ist dringend, sonst verpasst er was\"", "\"Ich rufe später einfach nochmal wahllos an\""], correct: 1 },
        { q: "Was ist ein Nachteil von bewusst falschen Angaben, um am Gatekeeper vorbeizukommen?", options: ["Es gibt keinen Nachteil", "Es schadet Vertrauen und Ruf, sobald es auffliegt", "Es ist immer die schnellste Methode ohne Risiko", "Gatekeeper merken das nie"], correct: 1 },
        { q: "Warum ist Respekt gegenüber der Empfangsperson strategisch sinnvoll, nicht nur höflich?", options: ["Weil sie oft direkten Einfluss auf Rückruf/Terminvergabe hat", "Weil es gesetzlich vorgeschrieben ist", "Weil es keinen Unterschied macht, wie man auftritt", "Weil Empfangspersonen nie über Rückrufe entscheiden"], correct: 0 }
      ],
      open: { id:"k2-open", prompt: "Die Empfangsperson sagt: \"Der Chef nimmt grundsätzlich keine Verkaufsanrufe an.\" Wie reagierst du konkret, um trotzdem eine faire Chance auf einen Rückruf zu bekommen, ohne die Empfangsperson zu verärgern oder zu täuschen?", keyPoints: ["Bleibt freundlich und respektvoll statt insistierend/genervt", "Nennt einen klaren, ehrlichen Grund/Nutzen statt allgemeiner Verkaufsfloskeln", "Bietet eine niedrige, konkrete Hürde an (z.B. kurzer Rückruf-Zeitpunkt)", "Versucht nicht, die Empfangsperson zu täuschen oder zu umgehen"] }
    },
    {
      id: "k3", title: "Abschlusstechniken",
      theory: "Ein Abschluss sollte nie überraschend kommen – Kaufsignale (konkrete Nachfragen zu Lieferzeit, Ablauf, Vertragsdetails) zeigen an, dass der richtige Moment für eine klare, direkte Abschlussfrage gekommen ist. Wer nach einem klaren Kaufsignal weiter nur Informationen liefert, statt zu fragen, verpasst oft den besten Moment.\n\nBewährte Abschlusstechniken sind u.a. die Alternativfrage (\"Passt Ihnen der Starttermin eher nächste oder übernächste Woche?\", die implizit vom Ob zum Wie übergeht) und die Zusammenfassungs-Technik (Nutzen kurz bündeln, dann direkt die Abschlussfrage stellen). Entscheidend ist, danach zu schweigen und dem Kunden Raum für die Antwort zu lassen, statt die Stille nervös selbst zu füllen.",
      mc: [
        { q: "Was ist ein typisches Kaufsignal im Gespräch?", options: ["Der Kunde legt sofort auf", "Konkrete Nachfragen zu Lieferzeit, Ablauf oder Vertragsdetails", "Lange Pausen ohne jede Reaktion", "Wiederholte Ablehnung des gesamten Angebots"], correct: 1 },
        { q: "Was beschreibt die Alternativfrage als Abschlusstechnik?", options: ["Den Kunden zu fragen, ob er überhaupt kaufen will", "Zwei positive Optionen anzubieten, die implizit vom Ob zum Wie übergehen (z.B. Starttermin A oder B)", "Ausschließlich nach dem Preis zu fragen", "Den Kunden zur Konkurrenz zu schicken"], correct: 1 },
        { q: "Was sollte man nach einer direkten Abschlussfrage tun?", options: ["Sofort weiterreden, um die Stille zu füllen", "Schweigen und dem Kunden Raum für die Antwort lassen", "Das Thema wechseln", "Den Preis nochmal senken, ohne gefragt zu werden"], correct: 1 },
        { q: "Was passiert oft, wenn man nach einem klaren Kaufsignal weiter nur Informationen liefert statt abzuschließen?", options: ["Das ist immer die beste Strategie", "Man verpasst häufig den besten Moment für den Abschluss", "Es hat keinerlei Auswirkung", "Der Kunde kauft dadurch garantiert mehr"], correct: 1 },
        { q: "Was ist der Kern der Zusammenfassungs-Technik beim Abschluss?", options: ["Nutzen kurz bündeln, dann direkt die Abschlussfrage stellen", "Nur den Preis wiederholen", "Ein komplett neues Thema eröffnen", "Den Kunden mit Fachbegriffen überfordern"], correct: 0 },
        { q: "Warum ist Schweigen nach der Abschlussfrage psychologisch wichtig?", options: ["Weil es unhöflich wäre, sofort zu antworten", "Weil vorschnelles Nachreden oft als Unsicherheit wirkt und dem Kunden die nötige Entscheidungsruhe nimmt", "Weil es gesetzlich vorgeschrieben ist", "Es hat keine besondere Bedeutung"], correct: 1 }
      ],
      open: { id:"k3-open", prompt: "Ein Kunde fragt mitten im Gespräch: \"Und wie schnell könnte das bei uns umgesetzt werden?\" Erkenne das Kaufsignal und beschreibe, wie du direkt im Anschluss zu einer passenden Abschlussfrage überleitest.", keyPoints: ["Erkennt die Frage klar als Kaufsignal, nicht nur als Nebeninformation", "Beantwortet die Frage kurz, leitet aber zeitnah zu einer echten Abschlussfrage über", "Nutzt idealerweise eine Alternativfrage oder vergleichbar konkrete Formulierung", "Wirkt entschlossen, nicht aufdringlich oder hektisch"] }
    }
  ]
}
];

export function allQuestionCountOfCourse(course) {
  return course.modules.reduce((s, m) => s + m.mc.length, 0);
}

export function allMcQuestionsOfCourse(course) {
  const out = [];
  course.modules.forEach((m) => m.mc.forEach((q) => out.push({ ...q, moduleId: m.id })));
  return out;
}

export function shuffledOptions(question) {
  const idx = question.options.map((_, i) => i);
  for (let i = idx.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return {
    options: idx.map((i) => question.options[i]),
    correctShuffledIndex: idx.indexOf(question.correct),
  };
}

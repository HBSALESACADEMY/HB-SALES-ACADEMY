-- Migration 34: Skript-Bibliothek befüllen & Flashcards deutlich erweitern
-- Einmalig im Supabase SQL Editor ausführen.
-- Alle Texte sind bewusst produktneutral als Ausgangspunkt gedacht — passt sie
-- gerne an eure genaue Tonalität und euer Angebot an.

insert into scripts (category, title, body) values
('Begrüßung', 'Kaltakquise-Opener (freundlich, direkt)',
 'Guten Tag, hier ist [Name] von [Unternehmen]. Ich rufe an, weil [konkreter, kurzer Grund — z.B. eine Beobachtung zum Unternehmen des Angerufenen]. Passt es Ihnen gerade für zwei Minuten, oder rufe ich lieber später nochmal an?'),

('Begrüßung', 'Warm-Call bei bestehendem Kontaktpunkt',
 'Hallo [Name], hier ist [Name] von [Unternehmen] — wir hatten vor Kurzem [Kontaktpunkt, z.B. Messe/Empfehlung/Formular] Kontakt. Ich wollte kurz nachfragen, ob das für Sie gerade noch relevant ist.'),

('Gatekeeper', 'Freundlicher Umgang mit der Empfangsperson',
 'Hallo, ich bin [Name] von [Unternehmen]. Ich rufe wegen [konkreter Grund] an — wann würde es dem/der [Ansprechpartner] am besten passen, kurz zurückzurufen, vormittags oder eher nachmittags?'),

('Gatekeeper', 'Wenn die Empfangsperson abblockt',
 'Das verstehe ich total, Sie bekommen sicher viele Anrufe. Kurz zur Einordnung: es geht konkret um [ein Satz Nutzen] — würden Sie mir kurz sagen, wie ich am besten einen kurzen Rückruf vereinbaren kann?'),

('Einwandbehandlung', 'Preis-Einwand: "Zu teuer"',
 'Verstehe ich gut — darf ich kurz fragen, im Vergleich wozu das zu teuer wirkt? [Antwort abwarten] Wenn wir uns das auf [Zeiteinheit] runterbrechen, sprechen wir eigentlich über [Betrag] — und dafür bekommen Sie [konkreter Nutzen]. Macht das für Sie einen Unterschied?'),

('Einwandbehandlung', 'Konkurrenz-Einwand: "Wir haben schon einen Anbieter"',
 'Das ist doch gut, dann läuft bei Ihnen schon etwas. Darf ich fragen, was aktuell am besten funktioniert — und gibt es etwas, das Sie sich zusätzlich wünschen würden?'),

('Einwandbehandlung', '"Ich muss das intern abstimmen"',
 'Macht total Sinn. Wer ist da noch mit im Boot, und worauf legt diese Person besonders Wert? Ich kann Ihnen gerne eine kurze Zusammenfassung mitgeben, die Sie einfach weiterleiten können.'),

('Einwandbehandlung', '"Kein Bedarf gerade"',
 'Verstehe ich. Darf ich kurz fragen, wie die aktuelle Situation bei Ihnen aussieht — läuft das bei Ihnen komplett reibungslos, oder gibt es Punkte, die schon mal knapp werden?'),

('Abschluss', 'Alternativfrage zum Abschluss',
 'Dann würde ich sagen, wir starten — passt Ihnen der Beginn eher nächste Woche oder übernächste Woche besser?'),

('Abschluss', 'Zusammenfassung vor dem Abschluss',
 'Zusammengefasst: Sie bekommen [Nutzen 1], [Nutzen 2] und [Nutzen 3]. Soll ich das für Sie fixmachen?'),

('Preisgespräch', 'Rabattforderung mit Gegenleistung koppeln',
 'Ich kann Ihnen entgegenkommen, wenn wir uns heute auf den Start einigen — dann sind [X]% für mich machbar. Passt das für Sie?'),

('Nachfassen', 'Rückruf nach Terminverschiebung',
 'Hallo [Name], wir hatten für [Zeitpunkt] einen kurzen Rückruf vereinbart — passt es Ihnen jetzt, oder soll ich es nochmal verschieben?'),

('Bestandskunden', 'Proaktiver Check-in-Anruf',
 'Hallo [Name], ich wollte einfach kurz nachfragen — läuft bei Ihnen aktuell alles wie gewünscht mit [Produkt/Leistung]?'),

('Bestandskunden', 'Empfehlungsfrage nach positivem Feedback',
 'Das freut mich wirklich zu hören! Kennen Sie zufällig jemanden aus Ihrem Netzwerk, dem das auch weiterhelfen könnte?')
on conflict do nothing;

insert into flashcards (tag, front, back) values
('Grundlagen', 'Was ist der Unterschied zwischen Merkmal, Vorteil und Nutzen?', 'Merkmal = objektive Eigenschaft. Vorteil = was das Merkmal allgemein bewirkt. Nutzen = was der Vorteil KONKRET für DIESEN Kunden bedeutet.'),
('Grundlagen', 'Warum ist aktives Zuhören mehr als nur "nicht reden"?', 'Es bedeutet, Gesagtes zusammenzufassen, Verständnisfragen zu stellen und auf den emotionalen Unterton zu reagieren — nicht nur zu warten, bis man selbst wieder dran ist.'),
('Grundlagen', 'Was ist der Unterschied zwischen offenen und geschlossenen Fragen?', 'Offene Fragen ("Wie...", "Was...") öffnen das Gespräch und liefern mehr Information. Geschlossene Fragen ("Ja/Nein") eignen sich, um etwas zu bestätigen oder abzuschließen.'),
('Beziehungsaufbau', 'Was ist Rapport im Verkaufskontext?', 'Ein Gefühl von Vertrauen und Verbundenheit zwischen Verkäufer und Kunde — entsteht u.a. durch Mirroring, echtes Interesse und gemeinsame Anknüpfungspunkte.'),
('Beziehungsaufbau', 'Was bedeutet Mirroring, ohne dass es unnatürlich wirkt?', 'Sich unauffällig an Sprechtempo, Tonlage oder Wortwahl des Gesprächspartners anzupassen — nicht wörtlich nachahmen, sondern sich subtil angleichen.'),
('Psychologie', 'Was besagt der Ankereffekt?', 'Die erste genannte Zahl/Information prägt unbewusst den Rahmen für alles, was danach kommt — wer zuerst eine Zahl nennt, beeinflusst die Erwartung.'),
('Psychologie', 'Was ist Verlustaversion?', 'Menschen empfinden einen Verlust psychologisch stärker als einen gleich großen Gewinn — deshalb wirkt "was Sie verpassen" oft stärker als "was Sie gewinnen".'),
('Psychologie', 'Was ist das Reziprozitätsprinzip?', 'Menschen fühlen sich unbewusst verpflichtet, eine erhaltene Gefälligkeit zu erwidern — z.B. nach einem kostenlosen, echten Mehrwert.'),
('Psychologie', 'Was ist soziale Bewährtheit (Social Proof)?', 'Menschen orientieren sich am Verhalten anderer, besonders in unsicheren Situationen — z.B. Referenzen, Kundenstimmen, "andere haben sich auch dafür entschieden".'),
('Psychologie', 'Was ist das Knappheitsprinzip?', 'Dinge wirken wertvoller, wenn sie begrenzt verfügbar sind — funktioniert nur glaubwürdig, wenn die Knappheit real ist, nicht künstlich vorgetäuscht.'),
('Psychologie', 'Was ist Reaktanz?', 'Ein psychologischer Widerstand gegen wahrgenommenen Druck — Menschen wehren sich, um ihre Entscheidungsfreiheit zu verteidigen.'),
('Psychologie', 'Was ist der Unterschied zwischen System 1 und System 2 nach Kahneman?', 'System 1 = schnell, intuitiv, emotional. System 2 = langsam, rational, bewusst. Die meisten Kaufimpulse entstehen in System 1.'),
('Psychologie', 'Was ist Framing?', 'Dieselbe Information unterschiedlich formuliert wirkt unterschiedlich — z.B. "90% Erfolgsquote" statt "10% Fehlerquote".'),
('Psychologie', 'Was ist der Kontrasteffekt in der Preispräsentation?', 'Ein Preis wirkt günstiger oder teurer je nachdem, womit er kurz zuvor verglichen wurde.'),
('Einwände', 'Was sind die 4 Schritte der Einwandbehandlung?', 'Anerkennen → Verstehen/Nachfragen → Reframing → Bestätigung.'),
('Einwände', 'Warum sollte man einen Einwand nie sofort widerlegen?', 'Weil das Reaktanz auslöst und wie Rechtfertigung wirkt — erst verstehen, dann reagieren.'),
('Einwände', 'Was unterscheidet "Nein zum Moment" von "Nein zum Produkt"?', 'Ersteres ist oft ein Zeichen von Unsicherheit oder fehlender Info, kein endgültiges Nein — die Unterscheidung entscheidet über den weiteren Gesprächsverlauf.'),
('Verhandlung', 'Was ist die BATNA?', 'Best Alternative To a Negotiated Agreement — die beste Alternative, falls keine Einigung zustande kommt. Kennt man sie, verhandelt man ruhiger.'),
('Verhandlung', 'Warum sollte ein Rabatt immer an eine Gegenleistung gekoppelt sein?', 'Ohne Gegenleistung wirkt er als Schwäche und provoziert oft weitere Forderungen.'),
('Verhandlung', 'Was ist Paketverhandlung?', 'Statt einzelner Punkte werden mehrere Elemente gemeinsam verhandelt, sodass jede Seite in ihrem wichtigsten Punkt gewinnt.'),
('Kaltakquise', 'Was ist meist das realistische Ziel eines Erstanrufs?', 'Nicht der Sofort-Abschluss, sondern ein qualifizierter nächster Schritt: Termin, Rückruf, bestätigtes Interesse.'),
('Kaltakquise', 'Wie sollte man Gatekeeper/Empfangspersonen behandeln?', 'Als potenzielle Verbündete mit echtem Einfluss auf den Rückruf, nicht als Hindernis.'),
('Abschluss', 'Was ist ein typisches Kaufsignal?', 'Konkrete Nachfragen zu Lieferzeit, Ablauf oder Vertragsdetails.'),
('Abschluss', 'Was ist die Alternativfrage als Abschlusstechnik?', 'Zwei positive Optionen anbieten, die implizit vom Ob zum Wie übergehen — z.B. "Starttermin nächste oder übernächste Woche?"'),
('Abschluss', 'Warum ist Schweigen nach der Abschlussfrage wichtig?', 'Vorschnelles Nachreden wirkt oft als Unsicherheit und nimmt dem Kunden die nötige Entscheidungsruhe.'),
('Bestandskunden', 'Wann ist der beste Zeitpunkt für Cross-Selling?', 'Nach einem bestätigten positiven Erlebnis des Kunden mit dem bestehenden Angebot — nicht während einer ungelösten Beschwerde.'),
('Bestandskunden', 'Wann ist der beste Zeitpunkt für eine Empfehlungsfrage?', 'Unmittelbar nach einem bestätigten positiven Erlebnis — mit konkretem Bezug zum Netzwerk des Kunden formuliert.'),
('Ethik', 'Welcher einfache Test unterscheidet Manipulation von legitimer Beeinflussung?', 'Würde die Aussage auch dann noch stimmen, wenn der Kunde sie vollständig nachprüfen könnte? Wenn nein: Manipulation.')
on conflict do nothing;

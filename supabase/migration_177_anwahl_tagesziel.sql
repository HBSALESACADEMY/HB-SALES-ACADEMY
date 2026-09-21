-- Das persönliche Anwahl-Ziel für den Tag.
--
-- Bisher kam das Tagespensom im Call Tracker aus einem persönlichen Ziel,
-- das jemand anders anlegt (team_goals mit user_id). Wer sich selbst ein
-- Ziel setzen wollte, konnte es nicht — und ein Ziel, das man sich selbst
-- setzt, wirkt nachweislich stärker als ein zugewiesenes.
--
-- Bewusst als einfache Zahl am Profil und nicht als weiteres Ziel in
-- team_goals: Es gehört keiner Woche und keinem Team, es ist das Pensum
-- für einen Arbeitstag. Zugewiesene Ziele gelten weiter — sie haben
-- Vorrang, damit eine Absprache mit der Leitung nicht stillschweigend
-- überschrieben wird (siehe lib/anwahlSpiel.js).
--
-- Die Obergrenze ist keine Gängelung, sondern ein Schutz vor Vertippern:
-- Wer 6000 einträgt statt 60, sieht sonst wochenlang einen leeren Ring.

alter table profiles add column if not exists anwahl_tagesziel integer
  check (anwahl_tagesziel is null or (anwahl_tagesziel > 0 and anwahl_tagesziel <= 500));

-- Diese Spalte darf jede Person bei sich selbst setzen. Der Schutz aus
-- migration_166 gilt für Rechte und Rollen, nicht für eigene Vorhaben —
-- deshalb steht sie dort ausdrücklich NICHT in der Liste.

-- Woran sich der Team-Wettbewerb misst.
--
-- Bisher fest XP, also Lern-Aktivität. Seit Team-Ziele auf Anwahlen und
-- Termine gehen (migration_85), standen auf der Seite „Mein Team" zwei
-- Maßstäbe nebeneinander: oben „143/200 Anwahlen", darunter eine Rangliste,
-- in der Anwahlen keine Rolle spielen. Ein Team konnte bei den Zielen vorn
-- liegen und im Wettbewerb hinten.
--
-- Erlaubte Werte: 'xp' (Voreinstellung) oder eine der Kennzahlen aus
-- lib/goalMetrics.js. Leer = 'xp', damit bestehende Organisationen den
-- Wettbewerb unverändert weiterführen.
alter table organizations add column if not exists team_ranking_metric text;

alter table organizations drop constraint if exists organizations_team_ranking_metric_check;
alter table organizations add constraint organizations_team_ranking_metric_check check (
  team_ranking_metric is null or team_ranking_metric in (
    'xp',
    'roleplay', 'quiz', 'daily_challenge',
    'anwahlen', 'erreicht', 'nicht', 'termin', 'negativ',
    'termine'
  )
);

-- Drei Kennzahlen mehr, damit sich Vertriebsziele überhaupt ausdrücken
-- lassen: gewonnene Kunden, Absagen und wahrgenommene Termine.
--
-- Nötig für die frei formulierten Ziele: Wer "3 neue Kunden gewinnen"
-- eintippt, braucht eine messbare Größe dahinter — die gab es bisher nicht.
alter table team_goals drop constraint if exists team_goals_metric_check;
alter table team_goals add constraint team_goals_metric_check check (metric in (
  'roleplay', 'quiz', 'daily_challenge',
  'anwahlen', 'erreicht', 'nicht', 'termin', 'negativ',
  'termine', 'kunden', 'absagen', 'wahrgenommen'
));

alter table organizations drop constraint if exists organizations_team_ranking_metric_check;
alter table organizations add constraint organizations_team_ranking_metric_check check (
  team_ranking_metric is null or team_ranking_metric in (
    'xp',
    'roleplay', 'quiz', 'daily_challenge',
    'anwahlen', 'erreicht', 'nicht', 'termin', 'negativ',
    'termine', 'kunden', 'absagen', 'wahrgenommen'
  )
);

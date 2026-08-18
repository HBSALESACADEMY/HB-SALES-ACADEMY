-- Team-Ziele auf mehr Kennzahlen als nur die drei Trainings-Werte.
--
-- Ein Vertriebsteam misst sich vor allem an seiner Aktivität am Telefon.
-- Deshalb kommen die Zähler des Call Trackers (Anwahlen, erreicht, nicht
-- erreicht, terminiert, negative Anrufe) und die erfassten Termine dazu.
-- Die Liste muss zu lib/goalMetrics.js passen.
--
-- Der alte check erlaubte nur ('roleplay','quiz','daily_challenge') — ohne
-- diese Migration lehnt die Datenbank jedes neue Ziel stumm mit einem
-- Constraint-Fehler ab.
alter table team_goals drop constraint if exists team_goals_metric_check;
alter table team_goals add constraint team_goals_metric_check check (metric in (
  'roleplay', 'quiz', 'daily_challenge',
  'anwahlen', 'erreicht', 'nicht', 'termin', 'negativ',
  'termine'
));

-- Ein Team darf jetzt mehrere Ziele gleichzeitig haben (etwa 200 Anwahlen
-- UND 10 Termine). Damit falsch gesetzte Ziele wieder verschwinden können,
-- fehlte bisher die Löschregel — es gab schlicht keine.
drop policy if exists "team_goals_delete_manager" on team_goals;
create policy "team_goals_delete_manager" on team_goals for delete using (is_lead_of_team(team_id, auth.uid()));

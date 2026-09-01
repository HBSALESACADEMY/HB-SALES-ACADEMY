-- Ziele auch auf Gatekeeper, Entscheider und Durchstellen.
--
-- Der Assistent im Call Tracker fragt seit kurzem, wen man erreicht hat und
-- ob durchgestellt wurde. Genau daran misst sich Kaltakquise — aber ein Ziel
-- liess sich darauf nicht setzen: die Datenbank kannte diese Kennzahlen
-- nicht, und die Regel hätte jedes solche Ziel abgelehnt.
--
-- Fortsetzung von migration_99, dieselbe Stelle, drei Werte mehr.
alter table team_goals drop constraint if exists team_goals_metric_check;
alter table team_goals add constraint team_goals_metric_check check (metric in (
  'roleplay', 'quiz', 'daily_challenge',
  'anwahlen', 'erreicht', 'nicht', 'termin', 'negativ',
  'gatekeeper', 'entscheider', 'weitergeleitet',
  'termine', 'kunden', 'absagen', 'wahrgenommen'
));

alter table organizations drop constraint if exists organizations_team_ranking_metric_check;
alter table organizations add constraint organizations_team_ranking_metric_check check (
  team_ranking_metric is null or team_ranking_metric in (
    'xp',
    'roleplay', 'quiz', 'daily_challenge',
    'anwahlen', 'erreicht', 'nicht', 'termin', 'negativ',
    'gatekeeper', 'entscheider', 'weitergeleitet',
    'termine', 'kunden', 'absagen', 'wahrgenommen'
  )
);

-- Navigationspunkt für die Ziel-Auswertung.
insert into nav_items (key, label, icon, route, is_builtin, requires_manager, visible, order_index)
values ('ziele', 'Ziele', 'target', '/ziele', true, false, true,
        coalesce((select order_index from nav_items where key = 'team'), 40) + 1)
on conflict (key) do update
  set label = excluded.label, icon = excluded.icon, route = excluded.route,
      visible = true, requires_manager = false;

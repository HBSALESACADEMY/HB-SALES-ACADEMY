-- Team-Ziele bekommen einen frei wählbaren Zeitraum und können sich an eine
-- einzelne Person richten.
--
-- Bisher galt jedes Ziel fest für die laufende Woche (week_start, montags
-- neu) und immer für das ganze Team. Beides war zu eng: ein Monatsziel liess
-- sich gar nicht abbilden, und ein Ziel für eine einzelne Person ebenso
-- wenig.
--
-- week_start bleibt erhalten und wird weiter befüllt (= starts_on), damit
-- nichts bricht, was noch danach fragt.
alter table team_goals add column if not exists starts_on date;
alter table team_goals add column if not exists ends_on date;

-- Ist user_id gesetzt, gilt das Ziel NUR für diese Person; der Fortschritt
-- zählt dann auch nur deren Beitrag. Ist es leer, gilt das Ziel fürs Team.
alter table team_goals add column if not exists user_id uuid references profiles(id) on delete cascade;

-- Bestehende Ziele nachtragen: sie liefen von Montag bis Sonntag.
update team_goals
set starts_on = week_start,
    ends_on = week_start + 6
where starts_on is null;

alter table team_goals alter column starts_on set default current_date;

-- Ein persönliches Ziel darf nur für jemanden aus demselben Team gesetzt
-- werden — sonst liesse sich über die Person die Mandanten-Grenze umgehen.
drop policy if exists "team_goals_insert_manager" on team_goals;
create policy "team_goals_insert_manager" on team_goals for insert with check (
  kann_team_verwalten(team_id, auth.uid())
  and (
    user_id is null
    or exists (select 1 from team_members tm where tm.team_id = team_goals.team_id and tm.user_id = team_goals.user_id)
  )
);

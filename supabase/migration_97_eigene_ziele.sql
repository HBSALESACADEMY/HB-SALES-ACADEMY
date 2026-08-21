-- Vertriebler dürfen sich selbst persönliche Ziele setzen.
--
-- Bisher durfte Ziele ausschliesslich anlegen, wer das Team verwaltet. Ein
-- eigenes Ziel für sich selbst — "diese Woche 150 Anwahlen" — ging damit
-- nicht, obwohl es niemanden ausser die Person selbst betrifft.
--
-- Erlaubt ist deshalb zusätzlich: ein Ziel, das AUF DIE EIGENE PERSON lautet
-- (user_id = auth.uid()), von ihr selbst angelegt wird und zu einem Team
-- gehört, in dem sie Mitglied ist. Team-Ziele bleiben der Leitung
-- vorbehalten — sonst könnte jede Person dem ganzen Team Vorgaben machen.
drop policy if exists "team_goals_insert_manager" on team_goals;
drop policy if exists "team_goals_insert" on team_goals;
create policy "team_goals_insert" on team_goals for insert with check (
  (
    kann_team_verwalten(team_id, auth.uid())
    and (
      user_id is null
      or exists (select 1 from team_members tm where tm.team_id = team_goals.team_id and tm.user_id = team_goals.user_id)
    )
  )
  or (
    user_id = auth.uid()
    and manager_id = auth.uid()
    and exists (select 1 from team_members tm where tm.team_id = team_goals.team_id and tm.user_id = auth.uid())
  )
);

-- Was man selbst gesetzt hat, darf man auch ändern und wieder entfernen.
drop policy if exists "team_goals_update_manager" on team_goals;
create policy "team_goals_update_manager" on team_goals for update
using (kann_team_verwalten(team_id, auth.uid()) or user_id = auth.uid())
with check (kann_team_verwalten(team_id, auth.uid()) or user_id = auth.uid());

drop policy if exists "team_goals_delete_manager" on team_goals;
create policy "team_goals_delete_manager" on team_goals for delete using (
  kann_team_verwalten(team_id, auth.uid()) or user_id = auth.uid()
);

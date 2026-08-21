-- Zwei Regeln fragten noch nach der falschen Seite.
--
-- 1) team_members: die Sichtbarkeit hing an teams.organization_id direkt.
--    Ist das Feld leer (Teams aus der Zeit vor migration_93), war die
--    Mitgliederliste für alle unsichtbar — während das Team selbst seit
--    migration_104 über team_organisation() sehr wohl sichtbar ist. Ein
--    Team ohne Mitglieder, wo Mitglieder drin sind.
--
-- 2) team_goals: die Sichtbarkeit hing an der Organisation der Person, die
--    das Ziel ANGELEGT hat (sieht_person(manager_id)). Setzt ein
--    Plattform-Admin per Firmencode ein Ziel für ein Kundenteam, gehört er
--    selbst zu einer anderen Organisation — das Ziel wäre für das Team
--    unsichtbar. Derselbe Konstruktionsfehler wie damals bei teams
--    (migration_93): das Ziel gehört zum TEAM, nicht zu seinem Urheber.
drop policy if exists "team_members_select_all" on team_members;
create policy "team_members_select_all" on team_members for select using (
  team_organisation(team_id) is not distinct from aktive_org(auth.uid())
);

drop policy if exists "team_goals_select_all" on team_goals;
create policy "team_goals_select_all" on team_goals for select using (
  team_organisation(team_id) is not distinct from aktive_org(auth.uid())
);

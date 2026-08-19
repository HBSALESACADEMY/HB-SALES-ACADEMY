-- Ein Team sehen durfte bisher nur, wer in derselben Organisation ist wie
-- die Person, die es ANGELEGT hat (same_org(created_by, auth.uid())). Die
-- eigene Mitgliedschaft spielte keine Rolle.
--
-- Folge: Wurde ein Team von einem Plattform-Admin mit anderer
-- Heimat-Organisation erstellt, konnten dessen Mitglieder ihr eigenes Team
-- nicht lesen — auf "Mein Team" stand "Du bist noch in keinem Team",
-- obwohl die Mitgliedschaft in der Datenbank stand.
--
-- Keine Regel-Schleife: die Leseregel auf team_members greift ihrerseits
-- nicht auf teams zu (siehe tests/zugriffsregeln.test.mjs).
drop policy if exists "teams_select_all" on teams;
create policy "teams_select_all" on teams for select using (
  same_org(created_by, auth.uid())
  or exists (select 1 from team_members tm where tm.team_id = teams.id and tm.user_id = auth.uid())
  or exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_platform_admin)
);

-- Bug: "new row violates row-level security policy for table team_members"
-- beim Hinzufügen eines Mitglieds — als Plattform-Admin, der per Firmencode
-- "als" eine andere Organisation eingeloggt ist. same_org(user_id, auth.uid())
-- vergleicht dabei die Heimat-Organisation des Plattform-Admin-Kontos gegen
-- die Organisation des hinzuzufügenden Mitglieds — die weichen bei einem
-- Firmencode-Wechsel bewusst voneinander ab (gleicher Grund wie bei
-- nav_items/custom_courses, siehe migration_53). Plattform-Admins sollen
-- Teams jeder Organisation verwalten können, deshalb hier wie an anderer
-- Stelle bereits üblich ein expliziter is_platform_admin-Bypass.
drop policy if exists "teams_select_all" on teams;
create policy "teams_select_all" on teams for select using (
  same_org(created_by, auth.uid())
  or exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_platform_admin)
);

drop policy if exists "team_members_select_all" on team_members;
create policy "team_members_select_all" on team_members for select using (
  same_org(user_id, auth.uid())
  or exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_platform_admin)
);

drop policy if exists "team_members_insert_lead" on team_members;
create policy "team_members_insert_lead" on team_members for insert with check (
  is_lead_of_team(team_id, auth.uid())
  and (
    same_org(user_id, auth.uid())
    or exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_platform_admin)
  )
);

-- Teams verwalten dürfen bisher AUSSCHLIESSLICH die Person, die das Team
-- angelegt hat (is_lead_of_team = teams.created_by). Wer die Organisation
-- betreibt, kam an ein Team, das jemand anderes erstellt hat, nicht heran:
-- keine Mitglieder hinzufügen, keine entfernen, keine Ziele setzen. Bei einem
-- ausgeschiedenen Teamlead ist das Team damit dauerhaft unverwaltbar.
--
-- Neu: zusätzlich Admins der GLEICHEN Organisation und Plattform-Admins.
-- Bewusst NICHT jede Person mit role='manager' — sonst könnte jeder Manager
-- in den Teams der anderen aufräumen.
create or replace function public.kann_team_verwalten(tid uuid, uid uuid)
returns boolean
language sql stable security definer as $$
  select exists (
    select 1
    from teams t
    join profiles lead on lead.id = t.created_by
    join profiles viewer on viewer.id = uid
    where t.id = tid
      and (
        t.created_by = uid
        or viewer.is_platform_admin
        -- "is not distinct from" statt "=": zwei NULL-Organisationen gelten
        -- als gleich, siehe Begründung bei same_org().
        or (viewer.is_admin and viewer.organization_id is not distinct from lead.organization_id)
      )
  );
$$;

-- --- team_members ---
drop policy if exists "team_members_insert_lead" on team_members;
create policy "team_members_insert_lead" on team_members for insert with check (
  kann_team_verwalten(team_id, auth.uid())
  and (
    same_org(user_id, auth.uid())
    or exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_platform_admin)
  )
);

-- Austreten bleibt jederzeit selbst möglich (auth.uid() = user_id).
drop policy if exists "team_members_delete_lead_or_self" on team_members;
create policy "team_members_delete_lead_or_self" on team_members for delete using (
  kann_team_verwalten(team_id, auth.uid()) or auth.uid() = user_id
);

-- --- team_goals ---
drop policy if exists "team_goals_insert_manager" on team_goals;
create policy "team_goals_insert_manager" on team_goals for insert with check (kann_team_verwalten(team_id, auth.uid()));
drop policy if exists "team_goals_update_manager" on team_goals;
create policy "team_goals_update_manager" on team_goals for update using (kann_team_verwalten(team_id, auth.uid()));
drop policy if exists "team_goals_delete_manager" on team_goals;
create policy "team_goals_delete_manager" on team_goals for delete using (kann_team_verwalten(team_id, auth.uid()));

-- Migration 47: Dritte Sichtbarkeits-Stufe für Recordings — "Nur Teamlead/
-- Manager" (statt nur "Nur für mich" oder "Ganzes Unternehmen"). Sichtbar
-- für den eigenen Teamlead (is_team_lead_of(), auch für team_goals/
-- team_requests genutzt) UND für Manager der eigenen Organisation — das
-- sind zwei unterschiedliche Personengruppen (ein Teamlead ist nicht
-- zwingend Manager, siehe teams.created_by).
-- Einmalig im Supabase SQL Editor ausführen.

alter table call_recordings drop constraint if exists call_recordings_visibility_check;
alter table call_recordings add constraint call_recordings_visibility_check check (visibility in ('org', 'private', 'team_lead'));

drop policy if exists "call_recordings_select" on call_recordings;
create policy "call_recordings_select" on call_recordings for select using (
  created_by = auth.uid()
  or (visibility = 'org' and same_org(created_by, auth.uid()))
  or (
    visibility = 'team_lead'
    and (
      is_team_lead_of(created_by, auth.uid())
      or (
        same_org(created_by, auth.uid())
        and exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'manager')
      )
    )
  )
  or exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_platform_admin)
);

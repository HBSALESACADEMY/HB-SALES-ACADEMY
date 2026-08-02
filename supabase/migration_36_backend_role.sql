-- Migration 36: Neue Rolle "backend" — sieht alle Leads/Termine der eigenen
-- Organisation (z.B. ein Fulfillment-/Backend-Team, das keine Vertriebs-
-- oder Nutzerverwaltungsrechte braucht, aber jeden erfassten Termin sehen
-- und dessen Status pflegen soll).
-- Einmalig im Supabase SQL Editor ausführen.

alter table profiles drop constraint if exists profiles_role_check;
alter table profiles add constraint profiles_role_check check (role in ('rep', 'manager', 'trainer', 'backend'));

drop policy if exists "leads_select" on leads;
create policy "leads_select" on leads for select using (
  created_by = auth.uid()
  or exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_platform_admin)
  or (
    exists (select 1 from profiles where profiles.id = auth.uid() and (profiles.role = 'manager' or profiles.role = 'backend' or profiles.is_admin))
    and same_org(created_by, auth.uid())
  )
);

drop policy if exists "leads_update" on leads;
create policy "leads_update" on leads for update using (
  created_by = auth.uid()
  or exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_platform_admin)
  or (
    exists (select 1 from profiles where profiles.id = auth.uid() and (profiles.role = 'manager' or profiles.role = 'backend' or profiles.is_admin))
    and same_org(created_by, auth.uid())
  )
);

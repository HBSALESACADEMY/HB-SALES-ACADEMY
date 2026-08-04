-- Migration 52: Teamleads (und Org-Admins/Plattform-Admins) bekommen dieselben
-- Inhalte-Verwaltungsrechte wie Manager/Trainer — Skript-Bibliothek, eigene
-- Kurse/Module, Flashcards, Wissensdatenbank. "Teamlead" ist keine gespeicherte
-- Rolle, sondern die Tatsache, mindestens ein Team gegründet zu haben
-- (teams.created_by) — dafür die neue Funktion is_team_lead(uid).
-- Einmalig im Supabase SQL Editor ausführen.

create or replace function public.is_team_lead(uid uuid)
returns boolean
language sql stable security definer as $$
  select exists (select 1 from teams where created_by = uid);
$$;

-- --- custom_courses ---
drop policy if exists "custom_courses_write_managers" on custom_courses;
create policy "custom_courses_write_managers" on custom_courses for insert with check (
  exists (select 1 from profiles where profiles.id = auth.uid() and (profiles.role in ('manager', 'trainer') or profiles.is_admin or profiles.is_platform_admin))
  or is_team_lead(auth.uid())
);
drop policy if exists "custom_courses_update_managers" on custom_courses;
create policy "custom_courses_update_managers" on custom_courses for update using (
  (
    exists (select 1 from profiles where profiles.id = auth.uid() and (profiles.role in ('manager', 'trainer') or profiles.is_admin or profiles.is_platform_admin))
    or is_team_lead(auth.uid())
  ) and same_org(created_by, auth.uid())
);
drop policy if exists "custom_courses_delete_managers" on custom_courses;
create policy "custom_courses_delete_managers" on custom_courses for delete using (
  (
    exists (select 1 from profiles where profiles.id = auth.uid() and (profiles.role in ('manager', 'trainer') or profiles.is_admin or profiles.is_platform_admin))
    or is_team_lead(auth.uid())
  ) and same_org(created_by, auth.uid())
);

-- --- custom_modules ---
drop policy if exists "custom_modules_write_managers" on custom_modules;
create policy "custom_modules_write_managers" on custom_modules for insert with check (
  exists (select 1 from profiles where profiles.id = auth.uid() and (profiles.role in ('manager', 'trainer') or profiles.is_admin or profiles.is_platform_admin))
  or is_team_lead(auth.uid())
);
drop policy if exists "custom_modules_update_managers" on custom_modules;
create policy "custom_modules_update_managers" on custom_modules for update using (
  (
    exists (select 1 from profiles where profiles.id = auth.uid() and (profiles.role in ('manager', 'trainer') or profiles.is_admin or profiles.is_platform_admin))
    or is_team_lead(auth.uid())
  ) and same_org(created_by, auth.uid())
);
drop policy if exists "custom_modules_delete_managers" on custom_modules;
create policy "custom_modules_delete_managers" on custom_modules for delete using (
  (
    exists (select 1 from profiles where profiles.id = auth.uid() and (profiles.role in ('manager', 'trainer') or profiles.is_admin or profiles.is_platform_admin))
    or is_team_lead(auth.uid())
  ) and same_org(created_by, auth.uid())
);

-- --- kb_entries ---
drop policy if exists "kb_entries_select_managers_all" on kb_entries;
create policy "kb_entries_select_managers_all" on kb_entries for select using (
  (
    exists (select 1 from profiles where profiles.id = auth.uid() and (profiles.role in ('manager', 'trainer') or profiles.is_admin or profiles.is_platform_admin))
    or is_team_lead(auth.uid())
  ) and same_org(created_by, auth.uid())
);
drop policy if exists "kb_entries_update_managers" on kb_entries;
create policy "kb_entries_update_managers" on kb_entries for update using (
  (
    exists (select 1 from profiles where profiles.id = auth.uid() and (profiles.role in ('manager', 'trainer') or profiles.is_admin or profiles.is_platform_admin))
    or is_team_lead(auth.uid())
  ) and same_org(created_by, auth.uid())
);
drop policy if exists "kb_entries_delete_managers" on kb_entries;
create policy "kb_entries_delete_managers" on kb_entries for delete using (
  (
    exists (select 1 from profiles where profiles.id = auth.uid() and (profiles.role in ('manager', 'trainer') or profiles.is_admin or profiles.is_platform_admin))
    or is_team_lead(auth.uid())
  ) and same_org(created_by, auth.uid())
);

-- --- scripts (bewusst weiterhin ohne 'trainer', wie bisher) ---
drop policy if exists "scripts_insert_managers" on scripts;
create policy "scripts_insert_managers" on scripts for insert with check (
  exists (select 1 from profiles where profiles.id = auth.uid() and (profiles.role = 'manager' or profiles.is_admin or profiles.is_platform_admin))
  or is_team_lead(auth.uid())
);
drop policy if exists "scripts_update_managers" on scripts;
create policy "scripts_update_managers" on scripts for update using (
  (
    exists (select 1 from profiles where profiles.id = auth.uid() and (profiles.role = 'manager' or profiles.is_admin or profiles.is_platform_admin))
    or is_team_lead(auth.uid())
  ) and same_org(created_by, auth.uid())
);
drop policy if exists "scripts_delete_managers" on scripts;
create policy "scripts_delete_managers" on scripts for delete using (
  (
    exists (select 1 from profiles where profiles.id = auth.uid() and (profiles.role = 'manager' or profiles.is_admin or profiles.is_platform_admin))
    or is_team_lead(auth.uid())
  ) and same_org(created_by, auth.uid())
);

-- --- flashcards ---
drop policy if exists "flashcards_write_managers" on flashcards;
create policy "flashcards_write_managers" on flashcards for insert with check (
  exists (select 1 from profiles where profiles.id = auth.uid() and (profiles.role in ('manager', 'trainer') or profiles.is_admin or profiles.is_platform_admin))
  or is_team_lead(auth.uid())
);
drop policy if exists "flashcards_delete_managers" on flashcards;
create policy "flashcards_delete_managers" on flashcards for delete using (
  (
    exists (select 1 from profiles where profiles.id = auth.uid() and (profiles.role in ('manager', 'trainer') or profiles.is_admin or profiles.is_platform_admin))
    or is_team_lead(auth.uid())
  ) and same_org(created_by, auth.uid())
);

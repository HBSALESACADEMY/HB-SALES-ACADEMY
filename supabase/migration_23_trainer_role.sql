-- Migration 23: neue Rolle "trainer" zusätzlich zu "rep"/"manager".
-- Einmalig im Supabase SQL Editor ausführen.
--
-- Trainer verwalten Trainingsinhalte der eigenen Organisation (Wissens-
-- datenbank-Vorschläge, individuelle Kurse, Navigation) — aber KEINE
-- Nutzerfreigabe/-verwaltung (das bleibt "manager" vorbehalten).

alter table profiles drop constraint if exists profiles_role_check;
alter table profiles add constraint profiles_role_check
  check (role in ('rep', 'manager', 'trainer'));

-- RLS-Policies für die Content-Verwaltung (nav_items, custom_courses,
-- custom_modules, kb_entries) waren bisher hart auf role = 'manager'
-- beschränkt — ohne diese Anpassung könnte ein Trainer die entsprechenden
-- Seiten zwar SEHEN, aber keine Änderungen SPEICHERN (RLS lehnt sonst ab).

drop policy if exists "nav_items_write_managers" on nav_items;
create policy "nav_items_write_managers" on nav_items for insert with check (exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role in ('manager', 'trainer')));
drop policy if exists "nav_items_update_managers" on nav_items;
create policy "nav_items_update_managers" on nav_items for update using (
  exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role in ('manager', 'trainer'))
  and (is_builtin = true or same_org(created_by, auth.uid()))
);
drop policy if exists "nav_items_delete_managers" on nav_items;
create policy "nav_items_delete_managers" on nav_items for delete using (
  exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role in ('manager', 'trainer'))
  and (is_builtin = true or same_org(created_by, auth.uid()))
);

drop policy if exists "custom_courses_write_managers" on custom_courses;
create policy "custom_courses_write_managers" on custom_courses for insert with check (exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role in ('manager', 'trainer')));
drop policy if exists "custom_courses_update_managers" on custom_courses;
create policy "custom_courses_update_managers" on custom_courses for update using (
  exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role in ('manager', 'trainer')) and same_org(created_by, auth.uid())
);
drop policy if exists "custom_courses_delete_managers" on custom_courses;
create policy "custom_courses_delete_managers" on custom_courses for delete using (
  exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role in ('manager', 'trainer')) and same_org(created_by, auth.uid())
);

drop policy if exists "custom_modules_write_managers" on custom_modules;
create policy "custom_modules_write_managers" on custom_modules for insert with check (exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role in ('manager', 'trainer')));
drop policy if exists "custom_modules_update_managers" on custom_modules;
create policy "custom_modules_update_managers" on custom_modules for update using (
  exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role in ('manager', 'trainer')) and same_org(created_by, auth.uid())
);
drop policy if exists "custom_modules_delete_managers" on custom_modules;
create policy "custom_modules_delete_managers" on custom_modules for delete using (
  exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role in ('manager', 'trainer')) and same_org(created_by, auth.uid())
);

drop policy if exists "kb_entries_select_managers_all" on kb_entries;
create policy "kb_entries_select_managers_all" on kb_entries for select using (
  exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role in ('manager', 'trainer')) and same_org(created_by, auth.uid())
);
drop policy if exists "kb_entries_update_managers" on kb_entries;
create policy "kb_entries_update_managers" on kb_entries for update using (
  exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role in ('manager', 'trainer')) and same_org(created_by, auth.uid())
);
drop policy if exists "kb_entries_delete_managers" on kb_entries;
create policy "kb_entries_delete_managers" on kb_entries for delete using (
  exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role in ('manager', 'trainer')) and same_org(created_by, auth.uid())
);

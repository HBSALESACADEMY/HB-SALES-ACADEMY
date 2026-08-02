-- Migration 42: Plattform-Admins sollen beim Testen einer Organisation per
-- Firmencode auch deren "Eigene Inhalte" (selbst angelegte Kurse, Module,
-- Sidebar-Ordner) sehen können, nicht nur die der eigenen Heimat-
-- Organisation. Bisher griff same_org() immer gegen die ECHTE
-- organization_id des Plattform-Admin-Accounts, nicht gegen die per
-- Firmencode "aktiv" gewählte Organisation.
-- Die eigentliche Trennung zwischen NORMALEN Organisationen bleibt
-- unverändert strikt (same_org) — das hier betrifft ausschließlich
-- Plattform-Admin-Konten.
-- Einmalig im Supabase SQL Editor ausführen.

drop policy if exists "custom_courses_select_all" on custom_courses;
create policy "custom_courses_select_all" on custom_courses for select using (
  same_org(created_by, auth.uid())
  or exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_platform_admin)
);

drop policy if exists "custom_modules_select_all" on custom_modules;
create policy "custom_modules_select_all" on custom_modules for select using (
  same_org(created_by, auth.uid())
  or exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_platform_admin)
);

drop policy if exists "nav_items_select_all" on nav_items;
create policy "nav_items_select_all" on nav_items for select using (
  is_builtin = true
  or same_org(created_by, auth.uid())
  or exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_platform_admin)
);

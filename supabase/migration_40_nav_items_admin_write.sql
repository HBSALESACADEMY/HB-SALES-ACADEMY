-- Migration 40: nav_items-Schreibrechte auf is_admin/is_platform_admin
-- erweitern — bisher durften nur role='manager'/'trainer' Reiter anlegen/
-- bearbeiten/löschen. Die neue "+ Neuer Reiter"-Schnellerstellung direkt in
-- der Sidebar (components/Layout.js) ist auch für reine Admin-Accounts ohne
-- role='manager' sichtbar; ohne diese Migration würde deren Anfrage von der
-- Datenbank abgelehnt.
-- Einmalig im Supabase SQL Editor ausführen.

drop policy if exists "nav_items_write_managers" on nav_items;
create policy "nav_items_write_managers" on nav_items for insert with check (
  exists (select 1 from profiles where profiles.id = auth.uid() and (profiles.role in ('manager', 'trainer') or profiles.is_admin or profiles.is_platform_admin))
);

drop policy if exists "nav_items_update_managers" on nav_items;
create policy "nav_items_update_managers" on nav_items for update using (
  exists (select 1 from profiles where profiles.id = auth.uid() and (profiles.role in ('manager', 'trainer') or profiles.is_admin or profiles.is_platform_admin))
  and (is_builtin = true or same_org(created_by, auth.uid()))
);

drop policy if exists "nav_items_delete_managers" on nav_items;
create policy "nav_items_delete_managers" on nav_items for delete using (
  exists (select 1 from profiles where profiles.id = auth.uid() and (profiles.role in ('manager', 'trainer') or profiles.is_admin or profiles.is_platform_admin))
  and (is_builtin = true or same_org(created_by, auth.uid()))
);

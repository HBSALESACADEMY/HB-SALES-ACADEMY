-- Migration 17: Plattform-Admin-Rolle (nur Houman) + 3-Farben-Branding pro Organisation
-- Einmalig im Supabase SQL Editor ausführen.

-- ============================================================
-- 1. Plattform-Admin: eigene Ebene ÜBER den einzelnen Organisationen.
--    Nur Houmans Konto bekommt sie automatisch gesetzt.
-- ============================================================

alter table profiles add column if not exists is_platform_admin boolean not null default false;

update profiles set is_platform_admin = true
where id = '17ebfce7-323c-4727-be86-0ab277c34ec5';


-- ============================================================
-- 2. Drei Verlaufsfarben statt einer Akzentfarbe
--    (primary_color bleibt die mittlere Farbe, bereits vorhanden)
-- ============================================================

alter table organizations add column if not exists secondary_color text;
alter table organizations add column if not exists tertiary_color text;


-- ============================================================
-- 3. organizations-Policies: Plattform-Admin darf alle sehen/anlegen/bearbeiten
-- ============================================================

drop policy if exists "organizations_select_own" on organizations;
create policy "organizations_select_own" on organizations for select using (
  id = (select organization_id from profiles where id = auth.uid())
  or exists (select 1 from profiles where id = auth.uid() and is_platform_admin = true)
);

drop policy if exists "organizations_update_admin" on organizations;
create policy "organizations_update_admin" on organizations for update using (
  (
    id = (select organization_id from profiles where id = auth.uid())
    and exists (select 1 from profiles where id = auth.uid() and is_admin = true)
  )
  or exists (select 1 from profiles where id = auth.uid() and is_platform_admin = true)
);

drop policy if exists "organizations_insert_platform_admin" on organizations;
create policy "organizations_insert_platform_admin" on organizations for insert with check (
  exists (select 1 from profiles where id = auth.uid() and is_platform_admin = true)
);

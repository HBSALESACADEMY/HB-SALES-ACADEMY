-- Migration 53: Behebt den Grund für "eigene Kurse/Ordner verschwinden
-- wieder" — nav_items und custom_courses hatten bisher KEINE eigene
-- organization_id-Spalte, die Zugehörigkeit wurde immer aus der Heimat-
-- Organisation (profiles.organization_id) der/des Erstellenden abgeleitet
-- (same_org(created_by, auth.uid())). Für Plattform-Admins, die per
-- Firmencode Inhalte für eine ANDERE Organisation anlegen, war das falsch:
-- der Ordner/Kurs landete faktisch in der eigenen Heimat-Organisation des
-- Plattform-Admins und verschwand dadurch für die eigentlich gemeinte
-- Organisation wieder (bzw. tauchte nur kurz auf, bis der nächste volle
-- Sidebar-Reload die falsch abgeleitete Organisation anwendete).
-- Einmalig im Supabase SQL Editor ausführen.

alter table nav_items add column if not exists organization_id uuid references organizations(id) on delete cascade;
alter table custom_courses add column if not exists organization_id uuid references organizations(id) on delete cascade;

-- Backfill: für alle BISHERIGEN Zeilen die Heimat-Organisation der/des
-- Erstellenden übernehmen — das ist der bisherige (fehlerhafte, aber für
-- normale Manager/Trainer meist korrekte) Stand, damit nichts plötzlich
-- verschwindet. Nur künftige, per Firmencode angelegte Inhalte bekommen ab
-- jetzt die tatsächlich aktive Organisation korrekt gesetzt.
update nav_items set organization_id = (select organization_id from profiles where profiles.id = nav_items.created_by)
  where organization_id is null and created_by is not null;
update custom_courses set organization_id = (select organization_id from profiles where profiles.id = custom_courses.created_by)
  where organization_id is null and created_by is not null;

-- --- nav_items ---
drop policy if exists "nav_items_select_all" on nav_items;
create policy "nav_items_select_all" on nav_items for select using (
  is_builtin = true
  or organization_id = (select organization_id from profiles where profiles.id = auth.uid())
  or exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_platform_admin)
);
drop policy if exists "nav_items_update_managers" on nav_items;
create policy "nav_items_update_managers" on nav_items for update using (
  exists (select 1 from profiles where profiles.id = auth.uid() and (profiles.role in ('manager', 'trainer') or profiles.is_admin or profiles.is_platform_admin))
  and (
    is_builtin = true
    or organization_id = (select organization_id from profiles where profiles.id = auth.uid())
    or exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_platform_admin)
  )
);
drop policy if exists "nav_items_delete_managers" on nav_items;
create policy "nav_items_delete_managers" on nav_items for delete using (
  exists (select 1 from profiles where profiles.id = auth.uid() and (profiles.role in ('manager', 'trainer') or profiles.is_admin or profiles.is_platform_admin))
  and (
    is_builtin = true
    or organization_id = (select organization_id from profiles where profiles.id = auth.uid())
    or exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_platform_admin)
  )
);

-- --- custom_courses ---
drop policy if exists "custom_courses_select_all" on custom_courses;
create policy "custom_courses_select_all" on custom_courses for select using (
  organization_id = (select organization_id from profiles where profiles.id = auth.uid())
  or exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_platform_admin)
);
drop policy if exists "custom_courses_update_managers" on custom_courses;
create policy "custom_courses_update_managers" on custom_courses for update using (
  (
    exists (select 1 from profiles where profiles.id = auth.uid() and (profiles.role in ('manager', 'trainer') or profiles.is_admin or profiles.is_platform_admin))
    or is_team_lead(auth.uid())
  ) and (
    organization_id = (select organization_id from profiles where profiles.id = auth.uid())
    or exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_platform_admin)
  )
);
drop policy if exists "custom_courses_delete_managers" on custom_courses;
create policy "custom_courses_delete_managers" on custom_courses for delete using (
  (
    exists (select 1 from profiles where profiles.id = auth.uid() and (profiles.role in ('manager', 'trainer') or profiles.is_admin or profiles.is_platform_admin))
    or is_team_lead(auth.uid())
  ) and (
    organization_id = (select organization_id from profiles where profiles.id = auth.uid())
    or exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_platform_admin)
  )
);

-- --- custom_modules --- (Organisation über den übergeordneten Kurs geprüft)
drop policy if exists "custom_modules_select_all" on custom_modules;
create policy "custom_modules_select_all" on custom_modules for select using (
  exists (
    select 1 from custom_courses cc where cc.id = custom_modules.course_id
    and cc.organization_id = (select organization_id from profiles where profiles.id = auth.uid())
  )
  or exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_platform_admin)
);
drop policy if exists "custom_modules_update_managers" on custom_modules;
create policy "custom_modules_update_managers" on custom_modules for update using (
  (
    exists (select 1 from profiles where profiles.id = auth.uid() and (profiles.role in ('manager', 'trainer') or profiles.is_admin or profiles.is_platform_admin))
    or is_team_lead(auth.uid())
  ) and (
    exists (
      select 1 from custom_courses cc where cc.id = custom_modules.course_id
      and cc.organization_id = (select organization_id from profiles where profiles.id = auth.uid())
    )
    or exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_platform_admin)
  )
);
drop policy if exists "custom_modules_delete_managers" on custom_modules;
create policy "custom_modules_delete_managers" on custom_modules for delete using (
  (
    exists (select 1 from profiles where profiles.id = auth.uid() and (profiles.role in ('manager', 'trainer') or profiles.is_admin or profiles.is_platform_admin))
    or is_team_lead(auth.uid())
  ) and (
    exists (
      select 1 from custom_courses cc where cc.id = custom_modules.course_id
      and cc.organization_id = (select organization_id from profiles where profiles.id = auth.uid())
    )
    or exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_platform_admin)
  )
);

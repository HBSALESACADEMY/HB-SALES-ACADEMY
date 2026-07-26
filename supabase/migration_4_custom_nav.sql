-- Migration 4: Frei editierbare Sidebar-Navigation + Ordner-Struktur für eigene Inhalte
-- Einmalig im Supabase SQL Editor ausführen.

create table if not exists nav_items (
  id uuid primary key default gen_random_uuid(),
  key text unique not null,
  label text not null,
  icon text not null default 'book',
  route text,
  is_builtin boolean not null default false,
  requires_manager boolean not null default false,
  visible boolean not null default true,
  order_index integer not null default 0,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table nav_items enable row level security;

create policy "nav_items_select_all" on nav_items for select using (true);
create policy "nav_items_write_managers" on nav_items for insert
  with check (exists (select 1 from profiles where id = auth.uid() and role = 'manager'));
create policy "nav_items_update_managers" on nav_items for update
  using (exists (select 1 from profiles where id = auth.uid() and role = 'manager'));
create policy "nav_items_delete_managers" on nav_items for delete
  using (exists (select 1 from profiles where id = auth.uid() and role = 'manager'));

-- Fest eingebaute Seiten als bearbeitbare/entfernbare Nav-Einträge anlegen.
-- (Löschen/Umbenennen entfernt nur den Sidebar-Link — die Seite selbst bleibt bestehen.)
insert into nav_items (key, label, icon, route, is_builtin, requires_manager, order_index) values
  ('dashboard', 'Dashboard', 'dashboard', '/', true, false, 0),
  ('courses', 'Kurse', 'book', '/courses', true, false, 1),
  ('roleplay', 'Rollenspiel', 'chat', '/roleplay', true, false, 2),
  ('call-tracker', 'Call Tracker', 'target', '/call-tracker', true, false, 3),
  ('einwand-trainer', 'Einwand-Trainer', 'flame', '/einwand-trainer', true, false, 4),
  ('knowledge', 'Wissensdatenbank', 'library', '/knowledge', true, false, 5),
  ('manager', 'Team (Manager)', 'users', '/manager', true, true, 6),
  ('admin', 'Nutzerverwaltung', 'lock', '/admin', true, true, 7),
  ('admin-content', 'Inhalte verwalten', 'book', '/admin/content', true, true, 8),
  ('admin-nav', 'Navigation verwalten', 'lock', '/admin/navigation', true, true, 9)
on conflict (key) do nothing;

-- Standard-Ordner für bereits bestehende "Eigene Inhalte"-Kurse, damit nichts verloren geht.
insert into nav_items (key, label, icon, is_builtin, requires_manager, order_index)
values ('custom-default', 'Eigene Inhalte', 'award', false, false, 100)
on conflict (key) do nothing;

-- Kurse einem Ordner (Nav-Eintrag) zuordnen, statt einem festen Reiter.
alter table custom_courses add column if not exists nav_item_id uuid references nav_items(id) on delete cascade;

update custom_courses set nav_item_id = (select id from nav_items where key = 'custom-default')
where nav_item_id is null;

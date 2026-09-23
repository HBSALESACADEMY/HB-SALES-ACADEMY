-- Migration 25: Skript-Bibliothek
-- Einmalig im Supabase SQL Editor ausführen.

create table if not exists scripts (
  id uuid primary key default gen_random_uuid(),
  category text not null default 'Allgemein',
  title text not null,
  body text not null,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table scripts enable row level security;
create policy "scripts_select_all" on scripts for select using (true);
create policy "scripts_insert_managers" on scripts for insert
  with check (exists (select 1 from profiles where id = auth.uid() and role = 'manager'));
create policy "scripts_update_managers" on scripts for update
  using (exists (select 1 from profiles where id = auth.uid() and role = 'manager'));
create policy "scripts_delete_managers" on scripts for delete
  using (exists (select 1 from profiles where id = auth.uid() and role = 'manager'));

insert into nav_items (key, label, icon, route, is_builtin, requires_manager, order_index) values
  ('scripts', 'Skript-Bibliothek', 'copy', '/scripts', true, false, 10),
  ('roleplay-history', 'Rollenspiel-Verlauf', 'chat', '/roleplay-history', true, false, 11)
on conflict (key) do nothing;

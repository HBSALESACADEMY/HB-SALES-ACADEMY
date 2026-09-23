-- Migration 15: Login-Verlauf für Manager
-- Einmalig im Supabase SQL Editor ausführen.

create table if not exists login_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table login_events enable row level security;

create policy "login_events_insert_own" on login_events for insert
  with check (auth.uid() = user_id);

create policy "login_events_select_managers" on login_events for select
  using (exists (select 1 from profiles where id = auth.uid() and role = 'manager'));

insert into nav_items (key, label, icon, route, is_builtin, requires_manager, order_index) values
  ('admin-logins', 'Login-Verlauf', 'lock', '/admin/logins', true, true, 20)
on conflict (key) do nothing;

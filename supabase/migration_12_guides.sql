-- Migration 12: Leitfaden-Generator (Cold Call / Closing Call)
-- Einmalig im Supabase SQL Editor ausführen.

create table if not exists guides (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('cold_call', 'closing_call')),
  title text not null,
  input jsonb not null default '{}'::jsonb,
  content jsonb not null,
  is_published boolean not null default false,
  created_by uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table guides enable row level security;

create policy "guides_select_own" on guides for select using (auth.uid() = created_by);
create policy "guides_select_published" on guides for select using (is_published = true);
create policy "guides_insert_own" on guides for insert with check (auth.uid() = created_by);
create policy "guides_update_own" on guides for update using (auth.uid() = created_by);
create policy "guides_delete_own_or_manager" on guides for delete using (
  auth.uid() = created_by
  or exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'manager')
);

-- Sidebar-Eintrag für die neue Seite.
insert into nav_items (key, label, icon, route, is_builtin, requires_manager, order_index)
values ('leitfaden-generator', 'Leitfaden-Generator', 'target', '/leitfaden-generator', true, false, 11)
on conflict (key) do nothing;

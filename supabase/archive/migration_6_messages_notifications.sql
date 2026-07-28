-- Migration 6: Private Nachrichten + Benachrichtigungs-Badges
-- Einmalig im Supabase SQL Editor ausführen.

-- Merkt sich, wann ein Nutzer zuletzt in der Community war (für den "ungelesen"-Badge).
alter table profiles add column if not exists last_seen_community_at timestamptz not null default now();

create table if not exists direct_messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references profiles(id) on delete cascade,
  recipient_id uuid not null references profiles(id) on delete cascade,
  content text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

alter table direct_messages enable row level security;

create policy "dm_select_own" on direct_messages for select
  using (auth.uid() = sender_id or auth.uid() = recipient_id);
create policy "dm_insert_own" on direct_messages for insert
  with check (auth.uid() = sender_id);
create policy "dm_update_recipient_marks_read" on direct_messages for update
  using (auth.uid() = recipient_id);

insert into nav_items (key, label, icon, route, is_builtin, requires_manager, order_index) values
  ('messages', 'Nachrichten', 'chat', '/messages', true, false, 13)
on conflict (key) do nothing;

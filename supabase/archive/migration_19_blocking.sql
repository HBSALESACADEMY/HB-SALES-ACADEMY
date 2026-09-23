-- Migration 19: Nutzer blockieren
-- Einmalig im Supabase SQL Editor ausführen.

create table if not exists blocks (
  id uuid primary key default gen_random_uuid(),
  blocker_id uuid not null references profiles(id) on delete cascade,
  blocked_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (blocker_id, blocked_id)
);

alter table blocks enable row level security;
create policy "blocks_select_own" on blocks for select using (auth.uid() = blocker_id);
create policy "blocks_insert_own" on blocks for insert with check (auth.uid() = blocker_id);
create policy "blocks_delete_own" on blocks for delete using (auth.uid() = blocker_id);

-- Blockierte können sich nicht mehr gegenseitig anschreiben, selbst wenn sie
-- weiterhin (oder wieder) befreundet wären.
drop policy if exists "dm_insert_friends" on direct_messages;
create policy "dm_insert_friends" on direct_messages for insert
  with check (
    auth.uid() = sender_id
    and exists (
      select 1 from friendships f
      where f.status = 'accepted'
        and ((f.requester_id = sender_id and f.addressee_id = recipient_id)
          or (f.requester_id = recipient_id and f.addressee_id = sender_id))
    )
    and not exists (
      select 1 from blocks b
      where (b.blocker_id = recipient_id and b.blocked_id = sender_id)
         or (b.blocker_id = sender_id and b.blocked_id = recipient_id)
    )
  );

-- Blockierte können sich auch keine neuen Freundschaftsanfragen mehr schicken.
drop policy if exists "friendships_insert_own" on friendships;
create policy "friendships_insert_own" on friendships for insert
  with check (
    auth.uid() = requester_id
    and not exists (
      select 1 from blocks b
      where (b.blocker_id = addressee_id and b.blocked_id = requester_id)
         or (b.blocker_id = requester_id and b.blocked_id = addressee_id)
    )
  );

insert into nav_items (key, label, icon, route, is_builtin, requires_manager, order_index) values
  ('certificates', 'Zertifikate', 'award', '/certificates', true, false, 9)
on conflict (key) do nothing;

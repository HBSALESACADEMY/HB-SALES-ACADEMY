-- Migration 17: Team-Beitrittsanfragen
-- Einmalig im Supabase SQL Editor ausführen.

create table if not exists team_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references profiles(id) on delete cascade,
  manager_id uuid not null references profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  unique (requester_id, manager_id)
);

alter table team_requests enable row level security;

create policy "team_requests_select_participant" on team_requests for select
  using (auth.uid() = requester_id or auth.uid() = manager_id);
create policy "team_requests_insert_own" on team_requests for insert
  with check (auth.uid() = requester_id);
create policy "team_requests_update_manager" on team_requests for update
  using (auth.uid() = manager_id or auth.uid() = requester_id);
create policy "team_requests_delete_participant" on team_requests for delete
  using (auth.uid() = requester_id or auth.uid() = manager_id);

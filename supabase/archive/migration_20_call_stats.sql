-- Migration 20: Zentrale Call-Tracker-Statistik
-- Einmalig im Supabase SQL Editor ausführen.

create table if not exists call_log_days (
  user_id uuid not null references profiles(id) on delete cascade,
  log_date date not null,
  counts jsonb not null default '{}'::jsonb,
  reasons jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, log_date)
);

alter table call_log_days enable row level security;
create policy "call_log_days_select_own" on call_log_days for select using (auth.uid() = user_id);
create policy "call_log_days_select_managers" on call_log_days for select
  using (exists (select 1 from profiles where id = auth.uid() and role = 'manager'));
create policy "call_log_days_upsert_own" on call_log_days for insert with check (auth.uid() = user_id);
create policy "call_log_days_update_own" on call_log_days for update using (auth.uid() = user_id);

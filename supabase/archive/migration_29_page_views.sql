-- Migration 29: Nutzungs-Tracking für Insights ("was wird am meisten genutzt")
-- Einmalig im Supabase SQL Editor ausführen.

create table if not exists page_views (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  path text not null,
  created_at timestamptz not null default now()
);

alter table page_views enable row level security;
create policy "page_views_insert_own" on page_views for insert with check (auth.uid() = user_id);
create policy "page_views_select_admin" on page_views for select
  using (exists (select 1 from profiles where id = auth.uid() and is_admin = true));

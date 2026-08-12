-- Persistierte Erwähnungen bei Termin-Kommentaren (analog zu
-- community_notifications, migration_63) — damit sie sich neben der
-- E-Mail auch im Dashboard anzeigen lassen.
create table if not exists lead_mentions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  actor_id uuid not null references profiles(id) on delete cascade,
  lead_id uuid not null references leads(id) on delete cascade,
  comment_id uuid references lead_comments(id) on delete cascade,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists lead_mentions_user_idx on lead_mentions(user_id, created_at desc);

alter table lead_mentions enable row level security;

drop policy if exists "lead_mentions_select_own" on lead_mentions;
create policy "lead_mentions_select_own" on lead_mentions for select using (user_id = auth.uid());
drop policy if exists "lead_mentions_insert_actor" on lead_mentions;
create policy "lead_mentions_insert_actor" on lead_mentions for insert with check (actor_id = auth.uid());
drop policy if exists "lead_mentions_update_own" on lead_mentions;
create policy "lead_mentions_update_own" on lead_mentions for update using (user_id = auth.uid());

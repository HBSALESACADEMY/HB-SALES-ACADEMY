-- Migration 18: Team-Wettbewerb, Mentoring-Paare, Team-Ziele, Kudos-Wall
-- Einmalig im Supabase SQL Editor ausführen.

-- XP-Log: jede XP-Vergabe wird protokolliert, damit sich "diese Woche" berechnen lässt
-- (für Team-Wettbewerb und Kudos-Wall). profiles.xp bleibt der laufende Gesamtstand.
create table if not exists xp_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  amount integer not null,
  created_at timestamptz not null default now()
);
alter table xp_log enable row level security;
create policy "xp_log_select_all" on xp_log for select using (true);
create policy "xp_log_insert_own" on xp_log for insert with check (auth.uid() = user_id);

-- increment_xp protokolliert jetzt zusätzlich in xp_log (bestehendes Verhalten bleibt gleich).
create or replace function increment_xp(uid uuid, amount integer)
returns void as $$
begin
  update profiles set xp = xp + amount where id = uid;
  insert into xp_log (user_id, amount) values (uid, amount);
end;
$$ language plpgsql security invoker;

-- Mentoring-Paare
create table if not exists mentor_pairs (
  id uuid primary key default gen_random_uuid(),
  mentor_id uuid not null references profiles(id) on delete cascade,
  mentee_id uuid not null references profiles(id) on delete cascade,
  manager_id uuid not null references profiles(id) on delete cascade,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table mentor_pairs enable row level security;
create policy "mentor_pairs_select_participant" on mentor_pairs for select
  using (auth.uid() = mentor_id or auth.uid() = mentee_id or auth.uid() = manager_id);
create policy "mentor_pairs_insert_manager" on mentor_pairs for insert
  with check (auth.uid() = manager_id);
create policy "mentor_pairs_update_manager" on mentor_pairs for update
  using (auth.uid() = manager_id);

-- Team-Ziele (wöchentlich)
create table if not exists team_goals (
  id uuid primary key default gen_random_uuid(),
  manager_id uuid not null references profiles(id) on delete cascade,
  title text not null,
  metric text not null check (metric in ('roleplay', 'quiz', 'daily_challenge')),
  target_count integer not null,
  week_start date not null,
  created_at timestamptz not null default now()
);
alter table team_goals enable row level security;
create policy "team_goals_select_all" on team_goals for select using (true);
create policy "team_goals_insert_manager" on team_goals for insert with check (auth.uid() = manager_id);
create policy "team_goals_update_manager" on team_goals for update using (auth.uid() = manager_id);

insert into nav_items (key, label, icon, route, is_builtin, requires_manager, order_index) values
  ('team', 'Mein Team', 'users', '/team', true, false, 8)
on conflict (key) do nothing;

-- Migration 5: Leaderboard, Community-Feed, KI-Wissensvorschläge
-- Einmalig im Supabase SQL Editor ausführen.

-- 1. Leaderboard: jeder freigegebene Nutzer darf die Basisdaten aller anderen
--    freigegebenen Nutzer sehen (für Rangliste/Community). Bestehende, engere
--    Policies (eigene Zeile, Team) bleiben zusätzlich bestehen.
create policy "profiles_select_leaderboard" on profiles for select
  using (status = 'approved');

-- 2. Community-Feed
create table if not exists community_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now()
);

create table if not exists community_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references community_posts(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now()
);

create table if not exists community_kudos (
  post_id uuid not null references community_posts(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

alter table community_posts enable row level security;
alter table community_comments enable row level security;
alter table community_kudos enable row level security;

create policy "community_posts_select_all" on community_posts for select using (true);
create policy "community_posts_insert_own" on community_posts for insert with check (auth.uid() = user_id);
create policy "community_posts_delete_own_or_manager" on community_posts for delete
  using (auth.uid() = user_id or exists (select 1 from profiles where id = auth.uid() and role = 'manager'));

create policy "community_comments_select_all" on community_comments for select using (true);
create policy "community_comments_insert_own" on community_comments for insert with check (auth.uid() = user_id);
create policy "community_comments_delete_own_or_manager" on community_comments for delete
  using (auth.uid() = user_id or exists (select 1 from profiles where id = auth.uid() and role = 'manager'));

create policy "community_kudos_select_all" on community_kudos for select using (true);
create policy "community_kudos_insert_own" on community_kudos for insert with check (auth.uid() = user_id);
create policy "community_kudos_delete_own" on community_kudos for delete using (auth.uid() = user_id);

-- 3. Wissensdatenbank-Einträge: manuell von Managern ODER als KI-Vorschlag aus
--    echten Rollenspiel-Auswertungen. Erscheinen erst nach Freigabe (status='approved')
--    für alle in der Wissensdatenbank.
create table if not exists kb_entries (
  id uuid primary key default gen_random_uuid(),
  tag text not null default 'Sonstiges',
  title text not null,
  body text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  source text not null default 'manual' check (source in ('manual', 'ai_roleplay')),
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table kb_entries enable row level security;

-- Jeder sieht genehmigte Einträge; Manager sehen zusätzlich alle (auch pending zur Prüfung).
create policy "kb_entries_select_approved" on kb_entries for select using (status = 'approved');
create policy "kb_entries_select_managers_all" on kb_entries for select
  using (exists (select 1 from profiles where id = auth.uid() and role = 'manager'));
-- Jeder freigegebene Nutzer darf einen Vorschlag (pending) einreichen — auch automatisch
-- nach einem Rollenspiel. Nur Manager dürfen den Status ändern (genehmigen/ablehnen).
create policy "kb_entries_insert_pending" on kb_entries for insert
  with check (status = 'pending');
create policy "kb_entries_update_managers" on kb_entries for update
  using (exists (select 1 from profiles where id = auth.uid() and role = 'manager'));
create policy "kb_entries_delete_managers" on kb_entries for delete
  using (exists (select 1 from profiles where id = auth.uid() and role = 'manager'));

-- 4. Neue Sidebar-Reiter
insert into nav_items (key, label, icon, route, is_builtin, requires_manager, order_index) values
  ('leaderboard', 'Rangliste', 'award', '/leaderboard', true, false, 10),
  ('community', 'Community', 'users', '/community', true, false, 11),
  ('admin-suggestions', 'Wissens-Vorschläge', 'lock', '/admin/suggestions', true, true, 12)
on conflict (key) do nothing;

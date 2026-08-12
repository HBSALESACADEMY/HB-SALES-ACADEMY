-- Benachrichtigt Mitglieder, wenn sie in einem Community-Beitrag oder
-- -Kommentar per @Name erwähnt werden. actor_id = wer die Erwähnung
-- ausgelöst hat (nicht zwingend user_id = die erwähnte Person), deshalb ist
-- das Insert-Recht an actor_id gebunden, nicht an user_id wie sonst üblich.
create table if not exists community_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  actor_id uuid not null references profiles(id) on delete cascade,
  type text not null check (type in ('mention_post', 'mention_comment')),
  post_id uuid not null references community_posts(id) on delete cascade,
  comment_id uuid references community_comments(id) on delete cascade,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists community_notifications_user_idx on community_notifications(user_id, created_at desc);

alter table community_notifications enable row level security;

drop policy if exists "community_notifications_select_own" on community_notifications;
create policy "community_notifications_select_own" on community_notifications for select using (user_id = auth.uid());

drop policy if exists "community_notifications_insert_actor" on community_notifications;
create policy "community_notifications_insert_actor" on community_notifications for insert with check (actor_id = auth.uid());

drop policy if exists "community_notifications_update_own" on community_notifications;
create policy "community_notifications_update_own" on community_notifications for update using (user_id = auth.uid());

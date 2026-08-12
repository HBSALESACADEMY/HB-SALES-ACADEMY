-- Community-Ausbau: Beiträge bearbeiten, mehrere Reaktionstypen, Anpinnen,
-- einfache Umfragen.

-- --- Beiträge bearbeiten + anpinnen ---
alter table community_posts add column if not exists pinned boolean not null default false;

drop policy if exists "community_posts_update_own_or_manager" on community_posts;
create policy "community_posts_update_own_or_manager" on community_posts for update using (
  auth.uid() = user_id
  or exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_platform_admin)
  or (
    exists (select 1 from profiles where profiles.id = auth.uid() and (profiles.role = 'manager' or profiles.is_admin))
    and same_org(user_id, auth.uid())
  )
);

-- --- Mehrere Reaktionstypen statt nur "Flamme" ---
alter table community_kudos add column if not exists reaction text not null default 'flame';
alter table community_kudos drop constraint if exists community_kudos_reaction_check;
alter table community_kudos add constraint community_kudos_reaction_check check (reaction in ('flame', 'thumbsup', 'heart', 'laugh'));

alter table community_comment_kudos add column if not exists reaction text not null default 'flame';
alter table community_comment_kudos drop constraint if exists community_comment_kudos_reaction_check;
alter table community_comment_kudos add constraint community_comment_kudos_reaction_check check (reaction in ('flame', 'thumbsup', 'heart', 'laugh'));

-- --- Einfache Umfragen (Einfachauswahl) ---
create table if not exists community_poll_options (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references community_posts(id) on delete cascade,
  label text not null,
  position int not null default 0
);

create table if not exists community_poll_votes (
  id uuid primary key default gen_random_uuid(),
  option_id uuid not null references community_poll_options(id) on delete cascade,
  post_id uuid not null references community_posts(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (post_id, user_id)
);

alter table community_poll_options enable row level security;
alter table community_poll_votes enable row level security;

drop policy if exists "community_poll_options_select_all" on community_poll_options;
create policy "community_poll_options_select_all" on community_poll_options for select using (
  exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_platform_admin)
  or exists (
    select 1 from community_posts cp where cp.id = community_poll_options.post_id
    and (cp.visibility = 'global' or same_org(cp.user_id, auth.uid()))
  )
);
drop policy if exists "community_poll_options_insert_own_post" on community_poll_options;
create policy "community_poll_options_insert_own_post" on community_poll_options for insert with check (
  exists (select 1 from community_posts cp where cp.id = community_poll_options.post_id and cp.user_id = auth.uid())
);

drop policy if exists "community_poll_votes_select_all" on community_poll_votes;
create policy "community_poll_votes_select_all" on community_poll_votes for select using (
  exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_platform_admin)
  or exists (
    select 1 from community_posts cp where cp.id = community_poll_votes.post_id
    and (cp.visibility = 'global' or same_org(cp.user_id, auth.uid()))
  )
);
drop policy if exists "community_poll_votes_insert_own" on community_poll_votes;
create policy "community_poll_votes_insert_own" on community_poll_votes for insert with check (
  auth.uid() = user_id
  and (
    exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_platform_admin)
    or exists (
      select 1 from community_posts cp where cp.id = community_poll_votes.post_id
      and (cp.visibility = 'global' or same_org(cp.user_id, auth.uid()))
    )
  )
);
drop policy if exists "community_poll_votes_delete_own" on community_poll_votes;
create policy "community_poll_votes_delete_own" on community_poll_votes for delete using (auth.uid() = user_id);

-- Umfragen können jetzt ein Ablaufdatum bekommen — nach Ablauf ist Abstimmen
-- nicht mehr möglich (client- UND serverseitig via RLS geprüft).
alter table community_posts add column if not exists poll_expires_at timestamptz;

drop policy if exists "community_poll_votes_insert_own" on community_poll_votes;
create policy "community_poll_votes_insert_own" on community_poll_votes for insert with check (
  auth.uid() = user_id
  and (
    exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_platform_admin)
    or exists (
      select 1 from community_posts cp where cp.id = community_poll_votes.post_id
      and (cp.visibility = 'global' or community_post_same_org(cp.organization_id, cp.user_id, auth.uid()))
    )
  )
  and not exists (
    select 1 from community_posts cp where cp.id = community_poll_votes.post_id
    and cp.poll_expires_at is not null and cp.poll_expires_at < now()
  )
);

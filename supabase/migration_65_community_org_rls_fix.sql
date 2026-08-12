-- Bug in migration_62: die Spalte community_posts.organization_id (die beim
-- Erstellen AKTIVE Organisation) wurde eingeführt und im Frontend korrekt
-- benutzt, aber die RLS-SELECT/INSERT/DELETE/UPDATE-Policies prüften
-- weiterhin same_org(user_id, auth.uid()) — also die HEIMAT-Organisation
-- des/der Autor:in, nicht die tatsächlich gespeicherte aktive Organisation.
-- Für Plattform-Admins, die per Firmencode "als" eine andere Organisation
-- posten, kam die Zeile serverseitig dadurch bei anderen Mitgliedern dieser
-- Organisation gar nicht erst an — unabhängig von der Frontend-Filterung.
create or replace function public.community_post_same_org(p_org uuid, p_author uuid, viewer uuid)
returns boolean
language sql stable security definer as $$
  select coalesce(p_org, (select organization_id from profiles where profiles.id = p_author))
       = (select organization_id from profiles where profiles.id = viewer);
$$;

drop policy if exists "community_posts_select_all" on community_posts;
create policy "community_posts_select_all" on community_posts for select using (
  visibility = 'global'
  or exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_platform_admin)
  or community_post_same_org(organization_id, user_id, auth.uid())
);

drop policy if exists "community_posts_delete_own_or_manager" on community_posts;
create policy "community_posts_delete_own_or_manager" on community_posts for delete using (
  auth.uid() = user_id
  or exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_platform_admin)
  or (
    exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'manager')
    and community_post_same_org(organization_id, user_id, auth.uid())
  )
);

drop policy if exists "community_posts_update_own_or_manager" on community_posts;
create policy "community_posts_update_own_or_manager" on community_posts for update using (
  auth.uid() = user_id
  or exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_platform_admin)
  or (
    exists (select 1 from profiles where profiles.id = auth.uid() and (profiles.role = 'manager' or profiles.is_admin))
    and community_post_same_org(organization_id, user_id, auth.uid())
  )
);

drop policy if exists "community_comments_select_all" on community_comments;
create policy "community_comments_select_all" on community_comments for select using (
  exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_platform_admin)
  or exists (
    select 1 from community_posts cp where cp.id = community_comments.post_id
    and (cp.visibility = 'global' or community_post_same_org(cp.organization_id, cp.user_id, auth.uid()))
  )
);
drop policy if exists "community_comments_insert_own" on community_comments;
create policy "community_comments_insert_own" on community_comments for insert with check (
  auth.uid() = user_id
  and (
    exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_platform_admin)
    or exists (
      select 1 from community_posts cp where cp.id = community_comments.post_id
      and (cp.visibility = 'global' or community_post_same_org(cp.organization_id, cp.user_id, auth.uid()))
    )
  )
);
drop policy if exists "community_comments_delete_own_or_manager" on community_comments;
create policy "community_comments_delete_own_or_manager" on community_comments for delete using (
  auth.uid() = user_id
  or exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_platform_admin)
  or (
    exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'manager')
    and same_org(user_id, auth.uid())
  )
);

drop policy if exists "community_kudos_select_all" on community_kudos;
create policy "community_kudos_select_all" on community_kudos for select using (
  exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_platform_admin)
  or exists (
    select 1 from community_posts cp where cp.id = community_kudos.post_id
    and (cp.visibility = 'global' or community_post_same_org(cp.organization_id, cp.user_id, auth.uid()))
  )
);
drop policy if exists "community_kudos_insert_own" on community_kudos;
create policy "community_kudos_insert_own" on community_kudos for insert with check (
  auth.uid() = user_id
  and (
    exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_platform_admin)
    or exists (
      select 1 from community_posts cp where cp.id = community_kudos.post_id
      and (cp.visibility = 'global' or community_post_same_org(cp.organization_id, cp.user_id, auth.uid()))
    )
  )
);

drop policy if exists "community_comment_kudos_select_all" on community_comment_kudos;
create policy "community_comment_kudos_select_all" on community_comment_kudos for select using (
  exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_platform_admin)
  or exists (
    select 1 from community_comments cc
    join community_posts cp on cp.id = cc.post_id
    where cc.id = community_comment_kudos.comment_id
    and (cp.visibility = 'global' or community_post_same_org(cp.organization_id, cp.user_id, auth.uid()))
  )
);
drop policy if exists "community_comment_kudos_insert_own" on community_comment_kudos;
create policy "community_comment_kudos_insert_own" on community_comment_kudos for insert with check (
  auth.uid() = user_id
  and (
    exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_platform_admin)
    or exists (
      select 1 from community_comments cc
      join community_posts cp on cp.id = cc.post_id
      where cc.id = community_comment_kudos.comment_id
      and (cp.visibility = 'global' or community_post_same_org(cp.organization_id, cp.user_id, auth.uid()))
    )
  )
);

drop policy if exists "community_poll_options_select_all" on community_poll_options;
create policy "community_poll_options_select_all" on community_poll_options for select using (
  exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_platform_admin)
  or exists (
    select 1 from community_posts cp where cp.id = community_poll_options.post_id
    and (cp.visibility = 'global' or community_post_same_org(cp.organization_id, cp.user_id, auth.uid()))
  )
);

drop policy if exists "community_poll_votes_select_all" on community_poll_votes;
create policy "community_poll_votes_select_all" on community_poll_votes for select using (
  exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_platform_admin)
  or exists (
    select 1 from community_posts cp where cp.id = community_poll_votes.post_id
    and (cp.visibility = 'global' or community_post_same_org(cp.organization_id, cp.user_id, auth.uid()))
  )
);
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
);

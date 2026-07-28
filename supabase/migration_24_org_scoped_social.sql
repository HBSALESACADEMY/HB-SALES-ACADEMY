-- Migration 24: klare Trennung zwischen eigener Organisation und
-- organisationsübergreifendem Bereich bei Mitgliedern, Chat und Community.
-- Einmalig im Supabase SQL Editor ausführen.
--
-- 1) Mitglieder der eigenen Organisation sind füreinander uneingeschränkt
--    sichtbar (nicht mehr nur Manager/Admins/Team-Kollegen). Zusätzlich ist
--    jedes freigegebene Profil grundsätzlich auffindbar (nötig für die
--    globale Suche/Community: "Profil ansehen" VOR einer Freundschafts-
--    anfrage muss möglich sein).
create or replace function public.can_view_profile(target_id uuid, viewer_id uuid)
returns boolean
language sql stable security definer as $$
  select
    target_id = viewer_id
    or exists (select 1 from profiles t where t.id = target_id and t.status = 'approved')
$$;

-- 2) Innerhalb der eigenen Organisation ist Chatten ohne Freundschaftsanfrage
--    erlaubt. Organisationsübergreifend bleibt weiterhin eine akzeptierte
--    Freundschaftsanfrage nötig. Blockierungen gelten in beiden Fällen.
drop policy if exists "dm_insert_friends" on direct_messages;
create policy "dm_insert_friends" on direct_messages for insert with check (
  auth.uid() = sender_id
  and (
    (group_id is not null and is_group_member(group_id, auth.uid()))
    or (
      group_id is null and recipient_id is not null
      and (
        same_org(sender_id, recipient_id)
        or exists (
          select 1 from friendships f
          where f.status = 'accepted'
            and ((f.requester_id = direct_messages.sender_id and f.addressee_id = direct_messages.recipient_id)
              or (f.requester_id = direct_messages.recipient_id and f.addressee_id = direct_messages.sender_id))
        )
      )
      and not exists (
        select 1 from blocks b
        where (b.blocker_id = direct_messages.recipient_id and b.blocked_id = direct_messages.sender_id)
           or (b.blocker_id = direct_messages.sender_id and b.blocked_id = direct_messages.recipient_id)
      )
    )
  )
);

-- 3) Jede Organisation bekommt ihre eigene, echte Community: neue Beiträge
--    sind standardmäßig NUR innerhalb der eigenen Organisation sichtbar
--    (visibility='org'). Wer möchte, kann einen Beitrag zusätzlich bewusst
--    in der globalen Community teilen (visibility='global').
alter table community_posts add column if not exists visibility text not null default 'org' check (visibility in ('org', 'global'));

drop policy if exists "community_posts_select_all" on community_posts;
create policy "community_posts_select_all" on community_posts for select using (
  visibility = 'global' or same_org(user_id, auth.uid())
);

drop policy if exists "community_comments_select_all" on community_comments;
create policy "community_comments_select_all" on community_comments for select using (
  exists (
    select 1 from community_posts cp where cp.id = community_comments.post_id
    and (cp.visibility = 'global' or same_org(cp.user_id, auth.uid()))
  )
);
drop policy if exists "community_comments_insert_own" on community_comments;
create policy "community_comments_insert_own" on community_comments for insert with check (
  auth.uid() = user_id
  and exists (
    select 1 from community_posts cp where cp.id = community_comments.post_id
    and (cp.visibility = 'global' or same_org(cp.user_id, auth.uid()))
  )
);

drop policy if exists "community_kudos_select_all" on community_kudos;
create policy "community_kudos_select_all" on community_kudos for select using (
  exists (
    select 1 from community_posts cp where cp.id = community_kudos.post_id
    and (cp.visibility = 'global' or same_org(cp.user_id, auth.uid()))
  )
);
drop policy if exists "community_kudos_insert_own" on community_kudos;
create policy "community_kudos_insert_own" on community_kudos for insert with check (
  auth.uid() = user_id
  and exists (
    select 1 from community_posts cp where cp.id = community_kudos.post_id
    and (cp.visibility = 'global' or same_org(cp.user_id, auth.uid()))
  )
);

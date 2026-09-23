-- Migration 24: Fix für RLS-Endlosschleife bei Gruppenchats
-- Einmalig im Supabase SQL Editor ausführen.

-- Diese Funktion prüft Gruppenmitgliedschaft OHNE die RLS-Regeln von
-- chat_group_members erneut auszulösen (security definer = läuft mit erhöhten
-- Rechten für genau diese eine, harmlose Prüfung). Das verhindert die
-- Endlosschleife, die entstand, als die Regel sich selbst abfragte.
create or replace function is_group_member(gid uuid, uid uuid)
returns boolean as $$
  select exists (select 1 from chat_group_members where group_id = gid and user_id = uid);
$$ language sql security definer stable;

drop policy if exists "chat_group_members_select_member" on chat_group_members;
create policy "chat_group_members_select_member" on chat_group_members for select
  using (is_group_member(group_id, auth.uid()));

drop policy if exists "dm_select_own" on direct_messages;
create policy "dm_select_own" on direct_messages for select
  using (
    auth.uid() = sender_id or auth.uid() = recipient_id
    or (group_id is not null and is_group_member(group_id, auth.uid()))
  );

drop policy if exists "dm_insert_friends" on direct_messages;
create policy "dm_insert_friends" on direct_messages for insert
  with check (
    auth.uid() = sender_id
    and (
      (group_id is not null and is_group_member(group_id, auth.uid()))
      or
      (group_id is null and recipient_id is not null
        and exists (
          select 1 from friendships f
          where f.status = 'accepted'
            and ((f.requester_id = sender_id and f.addressee_id = recipient_id)
              or (f.requester_id = recipient_id and f.addressee_id = sender_id))
        )
        and not exists (
          select 1 from blocks b
          where (b.blocker_id = recipient_id and b.blocked_id = sender_id)
             or (b.blocker_id = sender_id and b.blocked_id = recipient_id)
        ))
    )
  );

drop policy if exists "dm_uploads_group_member_read" on storage.objects;
create policy "dm_uploads_group_member_read" on storage.objects for select
  using (
    bucket_id = 'dm-uploads'
    and (storage.foldername(name))[1] like 'grp-%'
    and is_group_member(replace((storage.foldername(name))[1], 'grp-', '')::uuid, auth.uid())
  );

drop policy if exists "dm_uploads_group_member_insert" on storage.objects;
create policy "dm_uploads_group_member_insert" on storage.objects for insert
  with check (
    bucket_id = 'dm-uploads'
    and (storage.foldername(name))[1] like 'grp-%'
    and is_group_member(replace((storage.foldername(name))[1], 'grp-', '')::uuid, auth.uid())
  );

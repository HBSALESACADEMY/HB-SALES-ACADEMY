-- Migration 23: Team-Namen & Gruppenchats
-- Einmalig im Supabase SQL Editor ausführen.

alter table profiles add column if not exists team_name text;

-- Gruppenchats
create table if not exists chat_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists chat_group_members (
  group_id uuid not null references chat_groups(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

alter table chat_groups enable row level security;
alter table chat_group_members enable row level security;

create policy "chat_groups_select_member" on chat_groups for select
  using (exists (select 1 from chat_group_members m where m.group_id = id and m.user_id = auth.uid()));
create policy "chat_groups_insert_own" on chat_groups for insert
  with check (auth.uid() = created_by);

create policy "chat_group_members_select_member" on chat_group_members for select
  using (exists (select 1 from chat_group_members m2 where m2.group_id = group_id and m2.user_id = auth.uid()));
create policy "chat_group_members_insert" on chat_group_members for insert
  with check (
    exists (select 1 from chat_groups g where g.id = group_id and g.created_by = auth.uid())
    or exists (select 1 from chat_group_members m2 where m2.group_id = chat_group_members.group_id and m2.user_id = auth.uid())
  );
create policy "chat_group_members_delete_own" on chat_group_members for delete
  using (auth.uid() = user_id);

-- direct_messages um Gruppen-Support erweitern
alter table direct_messages add column if not exists group_id uuid references chat_groups(id) on delete cascade;
alter table direct_messages alter column recipient_id drop not null;

drop policy if exists "dm_select_own" on direct_messages;
create policy "dm_select_own" on direct_messages for select
  using (
    auth.uid() = sender_id or auth.uid() = recipient_id
    or (group_id is not null and exists (select 1 from chat_group_members m where m.group_id = direct_messages.group_id and m.user_id = auth.uid()))
  );

drop policy if exists "dm_insert_friends" on direct_messages;
create policy "dm_insert_friends" on direct_messages for insert
  with check (
    auth.uid() = sender_id
    and (
      -- Gruppen-Nachricht: Absender muss Mitglied der Gruppe sein
      (group_id is not null and exists (select 1 from chat_group_members m where m.group_id = direct_messages.group_id and m.user_id = auth.uid()))
      or
      -- 1:1-Nachricht: weiterhin nur zwischen bestätigten, nicht blockierten Freunden
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

-- Anhänge (Fotos/Dateien/Sprachnachrichten) auch in Gruppenchats: Ordnername "grp-<group_id>".
create policy "dm_uploads_group_member_read" on storage.objects for select
  using (
    bucket_id = 'dm-uploads'
    and (storage.foldername(name))[1] like 'grp-%'
    and exists (
      select 1 from chat_group_members m
      where m.group_id = replace((storage.foldername(name))[1], 'grp-', '')::uuid
        and m.user_id = auth.uid()
    )
  );

create policy "dm_uploads_group_member_insert" on storage.objects for insert
  with check (
    bucket_id = 'dm-uploads'
    and (storage.foldername(name))[1] like 'grp-%'
    and exists (
      select 1 from chat_group_members m
      where m.group_id = replace((storage.foldername(name))[1], 'grp-', '')::uuid
        and m.user_id = auth.uid()
    )
  );

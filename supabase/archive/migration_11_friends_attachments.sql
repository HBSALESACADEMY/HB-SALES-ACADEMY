-- Migration 11: Freundschaftsanfragen, Mitgliederliste, Chat-Anhänge
-- Einmalig im Supabase SQL Editor ausführen.

create table if not exists friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references profiles(id) on delete cascade,
  addressee_id uuid not null references profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  unique (requester_id, addressee_id)
);

alter table friendships enable row level security;
create policy "friendships_select_own" on friendships for select
  using (auth.uid() = requester_id or auth.uid() = addressee_id);
create policy "friendships_insert_own" on friendships for insert
  with check (auth.uid() = requester_id);
create policy "friendships_update_participant" on friendships for update
  using (auth.uid() = addressee_id or auth.uid() = requester_id);
create policy "friendships_delete_participant" on friendships for delete
  using (auth.uid() = requester_id or auth.uid() = addressee_id);

-- Direktnachrichten dürfen nur noch zwischen bestätigten Freunden verschickt werden.
drop policy if exists "dm_insert_own" on direct_messages;
create policy "dm_insert_friends" on direct_messages for insert
  with check (
    auth.uid() = sender_id
    and exists (
      select 1 from friendships f
      where f.status = 'accepted'
        and ((f.requester_id = sender_id and f.addressee_id = recipient_id)
          or (f.requester_id = recipient_id and f.addressee_id = sender_id))
    )
  );

-- Fotos, Dateien, Sprachnachrichten im Chat.
alter table direct_messages add column if not exists attachment_path text;
alter table direct_messages add column if not exists attachment_type text; -- 'image' | 'video' | 'audio' | 'file'
alter table direct_messages add column if not exists attachment_name text;

-- Privater Bucket: nur die beiden Gesprächspartner (aus dem Ordnernamen "userA_userB")
-- dürfen lesen/schreiben — nicht öffentlich wie die anderen Buckets.
insert into storage.buckets (id, name, public)
values ('dm-uploads', 'dm-uploads', false)
on conflict (id) do nothing;

create policy "dm_uploads_participant_read" on storage.objects for select
  using (
    bucket_id = 'dm-uploads'
    and auth.uid()::text in (
      split_part((storage.foldername(name))[1], '_', 1),
      split_part((storage.foldername(name))[1], '_', 2)
    )
  );

create policy "dm_uploads_participant_upload" on storage.objects for insert
  with check (
    bucket_id = 'dm-uploads'
    and auth.uid()::text in (
      split_part((storage.foldername(name))[1], '_', 1),
      split_part((storage.foldername(name))[1], '_', 2)
    )
  );

-- Neuer Sidebar-Reiter: Mitgliederliste
insert into nav_items (key, label, icon, route, is_builtin, requires_manager, order_index) values
  ('members', 'Mitglieder', 'users', '/members', true, false, 18)
on conflict (key) do nothing;

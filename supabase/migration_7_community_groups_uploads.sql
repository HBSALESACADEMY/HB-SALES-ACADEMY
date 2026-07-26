-- Migration 7: Community-Untergruppen + Datei-Uploads
-- Einmalig im Supabase SQL Editor ausführen.

create table if not exists community_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table community_groups enable row level security;
create policy "community_groups_select_all" on community_groups for select using (true);
create policy "community_groups_write_managers" on community_groups for insert
  with check (exists (select 1 from profiles where id = auth.uid() and role = 'manager'));
create policy "community_groups_delete_managers" on community_groups for delete
  using (exists (select 1 from profiles where id = auth.uid() and role = 'manager'));

-- Beiträge können optional zu einer Untergruppe gehören und einen Anhang haben.
alter table community_posts add column if not exists group_id uuid references community_groups(id) on delete set null;
alter table community_posts add column if not exists attachment_url text;
alter table community_posts add column if not exists attachment_type text; -- 'image' | 'video' | 'file'

-- Storage-Bucket für Community-Uploads (Bilder, Videos, Dateien), kostenlos bis 1 GB.
insert into storage.buckets (id, name, public)a
values ('community-uploads', 'community-uploads', true)
on conflict (id) do nothing;a

create policy "community_uploads_public_read" on storage.objects for select
  using (bucket_id = 'community-uploads');

create policy "community_uploads_approved_upload" on storage.objects for insert
  with check (
    bucket_id = 'community-uploads'
    and exists (select 1 from profiles where id = auth.uid() and status = 'approved')
  );

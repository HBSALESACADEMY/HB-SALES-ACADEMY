-- Migration 3: Dynamische Kurse + Video-Upload
-- Einmalig im Supabase SQL Editor ausführen.

create table if not exists custom_courses (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  color text not null default 'amber' check (color in ('amber', 'teal', 'coral', 'violet')),
  order_index integer not null default 0,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists custom_modules (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references custom_courses(id) on delete cascade,
  title text not null,
  content text,
  video_url text,
  order_index integer not null default 0,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table custom_courses enable row level security;
alter table custom_modules enable row level security;

-- Jeder freigegebene Nutzer darf lesen; nur Manager dürfen anlegen/ändern/löschen.
create policy "custom_courses_select_all" on custom_courses for select using (true);
create policy "custom_courses_write_managers" on custom_courses for insert
  with check (exists (select 1 from profiles where id = auth.uid() and role = 'manager'));
create policy "custom_courses_update_managers" on custom_courses for update
  using (exists (select 1 from profiles where id = auth.uid() and role = 'manager'));
create policy "custom_courses_delete_managers" on custom_courses for delete
  using (exists (select 1 from profiles where id = auth.uid() and role = 'manager'));

create policy "custom_modules_select_all" on custom_modules for select using (true);
create policy "custom_modules_write_managers" on custom_modules for insert
  with check (exists (select 1 from profiles where id = auth.uid() and role = 'manager'));
create policy "custom_modules_update_managers" on custom_modules for update
  using (exists (select 1 from profiles where id = auth.uid() and role = 'manager'));
create policy "custom_modules_delete_managers" on custom_modules for delete
  using (exists (select 1 from profiles where id = auth.uid() and role = 'manager'));

-- Storage-Bucket für Video-Uploads (kostenlos bis 1 GB im Supabase Free Tier)
insert into storage.buckets (id, name, public)
values ('course-videos', 'course-videos', true)
on conflict (id) do nothing;

create policy "course_videos_public_read" on storage.objects for select
  using (bucket_id = 'course-videos');

create policy "course_videos_managers_upload" on storage.objects for insert
  with check (
    bucket_id = 'course-videos'
    and exists (select 1 from profiles where id = auth.uid() and role = 'manager')
  );

create policy "course_videos_managers_delete" on storage.objects for delete
  using (
    bucket_id = 'course-videos'
    and exists (select 1 from profiles where id = auth.uid() and role = 'manager')
  );

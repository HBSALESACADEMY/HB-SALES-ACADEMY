-- Migration 46: "Recordings" — jedes Team-Mitglied kann eine Anruf-Aufnahme
-- hochladen (positiv oder negativ gelaufen), wählt Sichtbarkeit (ganze
-- Organisation oder nur für sich selbst), und die KI wertet sie automatisch
-- aus (Punktzahl + Feedback, wie beim Rollenspiel).
-- Einmalig im Supabase SQL Editor ausführen.

create table if not exists call_recordings (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references profiles(id) on delete cascade,
  label text,
  recording_path text not null,
  file_name text,
  visibility text not null default 'private' check (visibility in ('org', 'private')),
  status text not null default 'pending' check (status in ('pending', 'evaluated', 'failed')),
  evaluation_score integer,
  evaluation_summary text,
  evaluation_detail jsonb,
  created_at timestamptz not null default now()
);

alter table call_recordings enable row level security;

drop policy if exists "call_recordings_select" on call_recordings;
create policy "call_recordings_select" on call_recordings for select using (
  created_by = auth.uid()
  or (visibility = 'org' and same_org(created_by, auth.uid()))
  or exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_platform_admin)
);

drop policy if exists "call_recordings_insert_own" on call_recordings;
create policy "call_recordings_insert_own" on call_recordings for insert with check (created_by = auth.uid());

drop policy if exists "call_recordings_update_own" on call_recordings;
create policy "call_recordings_update_own" on call_recordings for update using (created_by = auth.uid());

drop policy if exists "call_recordings_delete" on call_recordings;
create policy "call_recordings_delete" on call_recordings for delete using (
  created_by = auth.uid()
  or exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_platform_admin)
  or (
    exists (select 1 from profiles where profiles.id = auth.uid() and (profiles.role = 'manager' or profiles.is_admin))
    and same_org(created_by, auth.uid())
  )
);

-- Privater Bucket, eigener Ordner pro Nutzer — Wiedergabe für andere (bei
-- visibility='org') läuft über eine signierte URL (siehe
-- pages/api/call-recording-url.js), nicht über direkten Storage-Zugriff.
insert into storage.buckets (id, name, public) values ('call-recordings', 'call-recordings', false)
on conflict (id) do nothing;

drop policy if exists "call_recordings_own_folder_all" on storage.objects;
create policy "call_recordings_own_folder_all" on storage.objects for all using (
  bucket_id = 'call-recordings' and (storage.foldername(name))[1] = auth.uid()::text
) with check (
  bucket_id = 'call-recordings' and (storage.foldername(name))[1] = auth.uid()::text
);

insert into nav_items (key, label, icon, route, is_builtin, requires_manager, order_index)
values ('recordings', 'Recordings', 'mic', '/recordings', true, false, 19)
on conflict (key) do nothing;

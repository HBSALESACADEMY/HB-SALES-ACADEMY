-- Migration 41: Datei-Anhänge auch bei Kurs-Modulen und Flashcards möglich
-- (analog zu den Skript-Anhängen aus migration_38/39) — ein gemeinsamer
-- Bucket für alle "Team-Inhalte"-Anhänge statt für jeden Inhaltstyp einen
-- eigenen.
-- Einmalig im Supabase SQL Editor ausführen.

alter table custom_modules add column if not exists file_url text;
alter table custom_modules add column if not exists file_name text;
alter table flashcards add column if not exists file_url text;
alter table flashcards add column if not exists file_name text;

insert into storage.buckets (id, name, public) values ('content-files', 'content-files', true)
on conflict (id) do nothing;

drop policy if exists "content_files_public_read" on storage.objects;
create policy "content_files_public_read" on storage.objects for select using (bucket_id = 'content-files');

-- Gleicher Personenkreis, der auch Kurse/Module/Flashcards anlegen darf
-- (siehe custom_modules_write_managers/flashcards_write_managers): Manager
-- und Trainer.
drop policy if exists "content_files_manager_upload" on storage.objects;
create policy "content_files_manager_upload" on storage.objects for insert with check (
  bucket_id = 'content-files'
  and exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role in ('manager', 'trainer'))
);

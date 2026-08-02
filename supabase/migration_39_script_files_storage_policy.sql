-- Migration 39: Fehlende Storage-Berechtigung für script-files nachtragen.
-- migration_38 hat den Bucket zwar als "öffentlich lesbar" angelegt, aber
-- öffentlich lesbar heißt NICHT automatisch "jeder darf hochladen" — dafür
-- braucht es eine explizite RLS-Policy auf storage.objects (wie bei
-- org-logos in migration_16), die bisher fehlte. Ohne sie schlug jeder
-- Upload fehl.
-- Einmalig im Supabase SQL Editor ausführen.

drop policy if exists "script_files_public_read" on storage.objects;
create policy "script_files_public_read" on storage.objects for select using (bucket_id = 'script-files');

drop policy if exists "script_files_manager_upload" on storage.objects;
create policy "script_files_manager_upload" on storage.objects for insert with check (
  bucket_id = 'script-files'
  and exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'manager')
);

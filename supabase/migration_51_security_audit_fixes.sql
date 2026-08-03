-- Migration 51: Behebt drei Funde aus einer Sicherheitsprüfung des Codes.
-- Einmalig im Supabase SQL Editor ausführen.

-- 1) script-files/content-files erlaubten Upload an JEDEN Pfad im Bucket,
-- nicht nur in den eigenen Ordner — ein Manager/Trainer hätte (in der
-- Theorie) Dateien in Pfade schreiben können, die von anderen
-- Organisationen genutzt werden. Jetzt wie bei call-recordings/
-- lead-recordings: nur der eigene, per Nutzer-ID benannte Ordner.
drop policy if exists "script_files_manager_upload" on storage.objects;
create policy "script_files_manager_upload" on storage.objects for insert with check (
  bucket_id = 'script-files'
  and (storage.foldername(name))[1] = auth.uid()::text
  and exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'manager')
);

drop policy if exists "content_files_manager_upload" on storage.objects;
create policy "content_files_manager_upload" on storage.objects for insert with check (
  bucket_id = 'content-files'
  and (storage.foldername(name))[1] = auth.uid()::text
  and exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role in ('manager', 'trainer'))
);

-- 2) call_recordings: Sichtbarkeits-Stufe "Teamlead/Manager" schloss die
-- Rolle "backend" aus, obwohl backend bei leads/Termine dieselbe
-- Übersichts-Berechtigung hat (gleiche Kategorie: Vertriebs-Aktivitäten).
-- Zusätzlich sahen is_admin-Konten diese Aufnahmen bisher nicht, obwohl
-- sie sie laut call_recordings_delete bereits löschen durften — Widerspruch
-- zwischen UI-Sichtbarkeit und tatsächlicher DB-Berechtigung behoben.
drop policy if exists "call_recordings_select" on call_recordings;
create policy "call_recordings_select" on call_recordings for select using (
  created_by = auth.uid()
  or (visibility = 'org' and same_org(created_by, auth.uid()))
  or (
    visibility = 'team_lead'
    and (
      is_team_lead_of(created_by, auth.uid())
      or (
        same_org(created_by, auth.uid())
        and exists (select 1 from profiles where profiles.id = auth.uid() and (profiles.role = 'manager' or profiles.role = 'backend' or profiles.is_admin))
      )
    )
  )
  or exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_platform_admin)
);

-- Hochgeladene Dateien bleiben in der Organisation.
--
-- Skripte, Kursanhänge, Karteikarten, Kursvideos und Community-Uploads
-- lagen in öffentlich lesbaren Speicherbereichen. Wer einen Link hatte —
-- weitergeleitet, aus dem Verlauf, erraten —, sah die Datei ohne Anmeldung
-- und ohne Organisation. Ein Gesprächsleitfaden war damit so öffentlich
-- wie eine Webseite.
--
-- Ab jetzt sind diese Bereiche privat. Dateien gibt nur noch der Server
-- heraus (pages/api/datei-link.js): als kurzlebigen Link und nur an Leute,
-- die den zugehörigen Eintrag nach den bestehenden Regeln sehen dürfen.
--
-- Die gespeicherten Links bleiben unverändert — sie sind jetzt die Kennung
-- der Datei statt einer offenen Adresse. Keine Datei muss verschoben werden.
--
-- Logos und Profilbilder bleiben öffentlich: Logos stehen in Mails an
-- Kunden, Profilbilder sind bewusst sichtbar. Private Nachrichten und
-- Mail-Anhänge waren schon vorher geschützt.

update storage.buckets
set public = false
where id in ('script-files', 'content-files', 'course-videos', 'community-uploads');

-- Die bekannten "jeder darf lesen"-Regeln.
drop policy if exists "script_files_public_read" on storage.objects;
drop policy if exists "content_files_public_read" on storage.objects;

-- Und jede weitere Leseregel für diese Bereiche, auch die, die einmal
-- direkt in Supabase angelegt wurden und in keiner Migration stehen.
-- Regeln, die ausserdem andere Bereiche betreffen, bleiben stehen.
do $$
declare
  regel record;
begin
  for regel in
    select policyname, coalesce(qual, '') as bedingung
    from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and cmd = 'SELECT'
  loop
    if (regel.bedingung ilike '%script-files%'
        or regel.bedingung ilike '%content-files%'
        or regel.bedingung ilike '%course-videos%'
        or regel.bedingung ilike '%community-uploads%')
       and regel.bedingung not ilike '%avatars%'
       and regel.bedingung not ilike '%org-logos%'
       and regel.bedingung not ilike '%dm-uploads%'
       and regel.bedingung not ilike '%email-anhaenge%'
       and regel.bedingung not ilike '%recordings%'
    then
      execute format('drop policy if exists %I on storage.objects', regel.policyname);
    end if;
  end loop;
end $$;

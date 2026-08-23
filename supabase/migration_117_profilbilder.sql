-- Profilbilder: Eimer und Regeln noch einmal ausdrücklich setzen.
--
-- Gemeldet: andere Personen können kein Profilbild hochladen. Die Regeln für
-- den avatars-Eimer stammen aus der allerersten Ausbaustufe (archive/
-- migration_9) und stehen in keiner aktuellen Datei — ob sie im laufenden
-- Projekt noch genau so gelten, ist von aussen nicht zu sehen.
--
-- Alles hier ist wiederholbar: bestehende Regeln werden ersetzt, der Eimer
-- nur angelegt, wenn er fehlt. Wer schon ein Bild hat, verliert nichts.
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do update set public = true;

-- Ansehen darf jede:r — Profilbilder erscheinen in Listen, im Organigramm
-- und in der Community, auch bevor man angemeldet ist (Login-Seite).
drop policy if exists "avatars_public_read" on storage.objects;
create policy "avatars_public_read" on storage.objects for select
  using (bucket_id = 'avatars');

-- Hochladen, ersetzen und löschen darf jede Person in IHREM eigenen Ordner.
-- Der Ordner ist die Konto-Kennung; damit kann niemand das Bild einer
-- anderen Person überschreiben. Keine Rollenprüfung: ein Profilbild ist
-- nichts, wofür man Manager sein muss.
drop policy if exists "avatars_own_upload" on storage.objects;
create policy "avatars_own_upload" on storage.objects for insert
  with check (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);

drop policy if exists "avatars_own_update" on storage.objects;
create policy "avatars_own_update" on storage.objects for update
  using (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1])
  with check (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);

drop policy if exists "avatars_own_delete" on storage.objects;
create policy "avatars_own_delete" on storage.objects for delete
  using (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);

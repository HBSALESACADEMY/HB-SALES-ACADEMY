-- Die Anhang-Dateien je Organisation abschotten.
--
-- Die Einträge in email_anhaenge waren schon getrennt (migration_143):
-- jede Organisation sieht nur ihre eigene Liste. Die DATEIEN im Speicher
-- waren es nicht. Die Regeln dort prüften nur "angemeldet" beziehungsweise
-- "Führungsrolle" — irgendeiner Organisation. Damit hätte die Leitung von
-- Firma B eine Datei von Firma A überschreiben oder löschen können, und
-- jede angemeldete Person eine fremde Datei lesen, sobald sie den Pfad
-- kennt. Beim Versand hätte Firma A dann die Datei von Firma B an ihre
-- Kunden geschickt.
--
-- Die Dateien liegen unter "<organisation>/<zeitstempel>-<name>"
-- (pages/email-marketing.js). Die Regeln prüfen jetzt, dass der erste
-- Ordner die AKTIVE Organisation ist.
--
-- Ohne Ausnahme für Plattform-Admins: Hochgeladen wird nur im
-- E-Mail-Marketing, und dort arbeitet auch ein Plattform-Admin unter dem
-- Firmencode der Organisation. Eine Pauschalausnahme hebelte genau die
-- Grenze aus, um die es hier geht.
--
-- Der Versand liest die Dateien über den Server mit erweiterten Rechten
-- und ist von diesen Regeln nicht betroffen.

drop policy if exists "email_anhaenge_lesen" on storage.objects;
create policy "email_anhaenge_lesen" on storage.objects for select using (
  bucket_id = 'email-anhaenge'
  and (storage.foldername(name))[1] = aktive_org(auth.uid())::text
);

drop policy if exists "email_anhaenge_schreiben" on storage.objects;
create policy "email_anhaenge_schreiben" on storage.objects for insert with check (
  bucket_id = 'email-anhaenge'
  and ist_fuehrungsrolle(auth.uid())
  and (storage.foldername(name))[1] = aktive_org(auth.uid())::text
);

drop policy if exists "email_anhaenge_entfernen" on storage.objects;
create policy "email_anhaenge_entfernen" on storage.objects for delete using (
  bucket_id = 'email-anhaenge'
  and ist_fuehrungsrolle(auth.uid())
  and (storage.foldername(name))[1] = aktive_org(auth.uid())::text
);

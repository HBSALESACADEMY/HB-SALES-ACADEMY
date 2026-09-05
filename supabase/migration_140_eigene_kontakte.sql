-- Eigene Kontakte bearbeiten und löschen dürfen.
--
-- Der Fehler: "Diesen Kontakt darf nur die Leitung der Organisation
-- löschen" — angezeigt der Leitung selbst.
--
-- Grund: Für eigene Zeilen gab es nur Lesen und Anlegen. Ändern und Löschen
-- lief ausschliesslich über die Leitungs-Regel, und die prüft zusätzlich
-- sieht_person(user_id) — also die Heimat-Organisation gegen die AKTIVE.
-- Wer per Firmencode in einer anderen Organisation arbeitet, kam damit an
-- seine eigenen Einträge nicht mehr heran.
--
-- Das ist zum dritten Mal dieselbe Falle (Duelle, Aufnahmen, jetzt hier):
-- ein Zweig mit "= auth.uid()" darf NIE zusätzlich eine
-- Organisationsbedingung tragen — und wo es einen solchen Zweig fürs Lesen
-- gibt, muss es ihn auch fürs Ändern und Löschen geben. Sonst sieht man
-- seine eigenen Daten und kann sie nicht anfassen.
drop policy if exists "email_kontakte_update_own" on email_kontakte;
create policy "email_kontakte_update_own" on email_kontakte for update using (auth.uid() = user_id);

drop policy if exists "email_kontakte_delete_own" on email_kontakte;
create policy "email_kontakte_delete_own" on email_kontakte for delete using (auth.uid() = user_id);

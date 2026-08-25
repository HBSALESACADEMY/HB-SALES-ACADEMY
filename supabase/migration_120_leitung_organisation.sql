-- Wer die Einstellungen seiner Organisation ändern darf.
--
-- Gemeldet: Als Organisationsleiter kommt man nicht an die eigenen
-- Ablehnungsgründe für den Call Tracker. Grund: Ändern an der Organisation
-- war an is_admin gebunden. Ein Konto mit der Rolle "manager" — die Leitung
-- einer Organisation — fiel damit heraus, obwohl in dieser Academy gilt:
-- Manager ist Leitung und darf in SEINER Organisation alles (migration_103).
--
-- Zweite Korrektur in derselben Regel: verglichen wurde gegen die
-- Heimat-Organisation des Kontos (profiles.organization_id) statt gegen die
-- aktive. Für einen Plattform-Admin per Firmencode sind das zwei
-- verschiedene Dinge (migration_92).
--
-- Anlegen und Löschen einer Organisation bleiben dem Plattform-Admin
-- vorbehalten — das betrifft nicht die eigene Arbeit, sondern den Bestand
-- der Kunden.
drop policy if exists "organizations_update_admin" on organizations;
create policy "organizations_update_admin" on organizations for update using (
  (id is not distinct from aktive_org(auth.uid()) and ist_fuehrungsrolle(auth.uid()))
  or exists (select 1 from profiles where id = auth.uid() and is_platform_admin = true)
);

-- 1) Jede Person darf ein eigenes Team gründen.
--
-- Bisher durften das nur Führungsrollen. Wer als Vertriebler ein paar
-- Kolleg:innen zusammenziehen wollte, brauchte dafür jemanden mit
-- Manager-Rechten — obwohl es niemanden ausser die Beteiligten betrifft.
--
-- Wer gründet, wird dadurch Leitung SEINES Teams (teams.created_by) und
-- bekommt über kann_team_verwalten() genau dort die Rechte. Er wird NICHT
-- Manager der Organisation: an fremden Teams ändert sich für ihn nichts.
drop policy if exists "teams_insert_managers" on teams;
drop policy if exists "teams_insert" on teams;
create policy "teams_insert" on teams for insert with check (
  created_by = auth.uid()
  and organization_id is not distinct from aktive_org(auth.uid())
);

-- 2) Auch bestehende Konten müssen ihr Profil vervollständigen.
--
-- migration_109 hatte Konten mit Namen als eingerichtet durchgewinkt, damit
-- niemand durch das Update ausgesperrt wird. Gewünscht ist aber genau das
-- Gegenteil: Jede Person soll beim nächsten Anmelden Foto, vollen Namen,
-- Geburtsdatum und Telefon nachtragen.
--
-- Die Oberfläche entscheidet ohnehin anhand der tatsächlichen Felder
-- (lib/profilPflicht.js) — diese Spalte wird beim Speichern nur
-- mitgeführt. Hier wird sie in Einklang gebracht.
update profiles
set profil_vollstaendig = (
  coalesce(nullif(trim(avatar_url), ''), null) is not null
  and position(' ' in trim(coalesce(full_name, ''))) > 0
  and geburtstag is not null
  and coalesce(nullif(trim(phone), ''), null) is not null
);

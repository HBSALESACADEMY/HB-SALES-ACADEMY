-- Migration 18: Organisationen löschbar machen (nur Plattform-Admin).
-- Einmalig im Supabase SQL Editor ausführen.
--
-- profiles.organization_id verweist ohne "on delete cascade" auf
-- organizations(id) — das ist Absicht: eine Organisation mit noch
-- vorhandenen Mitgliedern kann dadurch nicht gelöscht werden (Postgres
-- lehnt es mit einem Fremdschlüssel-Fehler ab), erst wenn alle Mitglieder
-- in eine andere Organisation verschoben oder entfernt wurden.

drop policy if exists "organizations_delete_platform_admin" on organizations;
create policy "organizations_delete_platform_admin" on organizations for delete using (
  exists (select 1 from profiles where id = auth.uid() and is_platform_admin = true)
);

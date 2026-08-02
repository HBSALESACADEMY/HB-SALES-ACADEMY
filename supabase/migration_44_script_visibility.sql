-- Migration 44: Skripte bekommen eine Sichtbarkeit — Standard weiterhin
-- organisationsweit, aber der/die Ersteller:in (Manager) kann ein Skript
-- auch als "nur für mich" markieren.
-- Einmalig im Supabase SQL Editor ausführen.

alter table scripts add column if not exists visibility text not null default 'org' check (visibility in ('org', 'private'));

drop policy if exists "scripts_select_all" on scripts;
create policy "scripts_select_all" on scripts for select using (
  created_by = auth.uid()
  or (visibility = 'org' and same_org(created_by, auth.uid()))
);

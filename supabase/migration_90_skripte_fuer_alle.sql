-- Skripte anlegen durfte bisher nur, wer Manager, Admin oder Teamlead ist.
-- Alle anderen sahen die Bibliothek als reine Leseliste — ohne Hinweis, dass
-- der Knopf zum Anlegen für sie schlicht nicht existiert.
--
-- Neu gilt dasselbe Muster wie beim Leitfaden-Generator: jede Person darf ein
-- eigenes Skript anlegen, aber nur für sich (visibility = 'private'). Für die
-- ganze Organisation veröffentlichen bleibt Führungsrollen vorbehalten.
create or replace function public.darf_skripte_veroeffentlichen(uid uuid)
returns boolean
language sql stable security definer as $$
  select exists (
    select 1 from profiles
    where id = uid and (role = 'manager' or is_admin or is_platform_admin)
  ) or is_team_lead(uid);
$$;

drop policy if exists "scripts_insert_managers" on scripts;
drop policy if exists "scripts_insert" on scripts;
create policy "scripts_insert" on scripts for insert with check (
  created_by = auth.uid()
  and (visibility = 'private' or darf_skripte_veroeffentlichen(auth.uid()))
);

-- with check ist hier entscheidend, nicht nur using: ohne sie könnte man ein
-- eigenes privates Skript nachträglich auf "für alle" umstellen und die
-- Beschränkung damit umgehen.
drop policy if exists "scripts_update_managers" on scripts;
drop policy if exists "scripts_update" on scripts;
create policy "scripts_update" on scripts for update
using (
  (created_by = auth.uid() and visibility = 'private')
  or (darf_skripte_veroeffentlichen(auth.uid())
      and (same_org(created_by, auth.uid()) or exists (select 1 from profiles where id = auth.uid() and is_platform_admin)))
)
with check (
  (created_by = auth.uid() and visibility = 'private')
  or (darf_skripte_veroeffentlichen(auth.uid())
      and (same_org(created_by, auth.uid()) or exists (select 1 from profiles where id = auth.uid() and is_platform_admin)))
);

drop policy if exists "scripts_delete_managers" on scripts;
drop policy if exists "scripts_delete" on scripts;
create policy "scripts_delete" on scripts for delete using (
  (created_by = auth.uid() and visibility = 'private')
  or (darf_skripte_veroeffentlichen(auth.uid())
      and (same_org(created_by, auth.uid()) or exists (select 1 from profiles where id = auth.uid() and is_platform_admin)))
);

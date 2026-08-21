-- Teams ohne eingetragene Organisation blockierten jede Verwaltung.
--
-- Seit migration_93 hängt die Berechtigung an teams.organization_id. Ist das
-- Feld leer — weil ein Team vor dieser Migration entstand und die
-- Nachtragung es nicht erwischt hat — vergleicht die Prüfung gegen NULL und
-- schlägt immer fehl. Folge: Ziele lassen sich nicht bearbeiten, Mitglieder
-- nicht zuordnen, und zwar für ALLE, auch für Admins.
--
-- Zwei Dinge dagegen: die Lücke schliessen, und die Prüfung so bauen, dass
-- sie sie künftig verkraftet.
update teams t
set organization_id = coalesce(
  (select p.organization_id
     from team_members m join profiles p on p.id = m.user_id
    where m.team_id = t.id and p.id <> t.created_by
    group by p.organization_id
    order by count(*) desc
    limit 1),
  (select organization_id from profiles where id = t.created_by))
where t.organization_id is null;

-- Fällt die Zuordnung trotzdem aus, gilt ersatzweise die Organisation der
-- anlegenden Person — besser eine plausible Annahme als eine Sperre, die
-- niemand auflösen kann.
create or replace function public.team_organisation(tid uuid)
returns uuid
language sql stable security definer as $$
  select coalesce(
    (select organization_id from teams where id = tid),
    (select p.organization_id from teams t join profiles p on p.id = t.created_by where t.id = tid)
  );
$$;

create or replace function public.kann_team_verwalten(tid uuid, uid uuid)
returns boolean
language sql stable security definer as $$
  select exists (
    select 1 from teams t
    where t.id = tid
      and (
        t.created_by = uid
        or (ist_fuehrungsrolle(uid) and team_organisation(tid) is not distinct from aktive_org(uid))
      )
  );
$$;

-- Dasselbe beim Lesen: ein Team ohne Organisation war sonst für niemanden
-- sichtbar ausser der anlegenden Person.
drop policy if exists "teams_select_all" on teams;
create policy "teams_select_all" on teams for select using (
  team_organisation(id) is not distinct from aktive_org(auth.uid())
);

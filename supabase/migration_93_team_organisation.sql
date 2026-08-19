-- Ein Team gehört jetzt einer Organisation, statt sie von der anlegenden
-- Person zu erben.
--
-- Bisher hing die Zuordnung an teams.created_by: als Organisation eines Teams
-- galt die der Person, die es erstellt hat. Für einen Plattform-Admin, der
-- per Firmencode für eine Kundenorganisation arbeitet, ist das falsch — sein
-- Konto gehört zu einer anderen Organisation als das Team, das er dort
-- anlegt. Seit migration_92 die Sichtbarkeit an die aktive Organisation
-- knüpft, verschwand ein so angelegtes Team komplett: "Du bist noch in keinem
-- Team", obwohl man es selbst erstellt hat.
--
-- Derselbe Konstruktionsfehler steckte schon hinter migration_89 (Mitglieder
-- sahen ihr eigenes Team nicht). Der wird hier an der Wurzel behoben.
alter table teams add column if not exists organization_id uuid references organizations(id) on delete cascade;

-- Nachtragen für bestehende Teams: bevorzugt die Organisation der
-- MITGLIEDER — sie sagt zuverlässiger, für wen das Team gedacht ist, als die
-- der anlegenden Person (siehe oben). Nur wenn es keine Mitglieder gibt,
-- bleibt die anlegende Person als Anhaltspunkt.
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

drop policy if exists "teams_select_all" on teams;
create policy "teams_select_all" on teams for select using (
  organization_id is not distinct from aktive_org(auth.uid())
  -- Mitgliedschaft zählt weiterhin: sonst verschwände das eigene Team, wenn
  -- die Zuordnung einmal nicht stimmt (migration_89).
  or exists (select 1 from team_members tm where tm.team_id = teams.id and tm.user_id = auth.uid())
);

-- Beim Anlegen muss die Organisation gesetzt sein und zur aktiven passen —
-- sonst könnte ein Team in einer fremden Organisation entstehen.
drop policy if exists "teams_insert_managers" on teams;
create policy "teams_insert_managers" on teams for insert with check (
  created_by = auth.uid()
  and organization_id is not distinct from aktive_org(auth.uid())
  and exists (
    select 1 from profiles
    where id = auth.uid() and (role = 'manager' or is_admin or is_platform_admin)
  )
);

-- Verwalten richtet sich ebenfalls nach der Organisation des TEAMS, nicht
-- nach der der anlegenden Person (migration_88 leitete sie von dort ab).
create or replace function public.kann_team_verwalten(tid uuid, uid uuid)
returns boolean
language sql stable security definer as $$
  select exists (
    select 1
    from teams t
    join profiles viewer on viewer.id = uid
    where t.id = tid
      and (
        t.created_by = uid
        or ((viewer.is_admin or viewer.is_platform_admin)
            and t.organization_id is not distinct from aktive_org(uid))
      )
  );
$$;

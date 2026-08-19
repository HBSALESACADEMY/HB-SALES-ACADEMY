-- Der Notausgang aus migration_89 muss weg.
--
-- Dort galt: "wer Mitglied ist, sieht das Team" — nötig, solange die
-- Organisation eines Teams von der anlegenden Person abgeleitet wurde und
-- Mitglieder ihr eigenes Team sonst nicht lesen durften.
--
-- Seit migration_93 trägt das Team seine Organisation selbst; der Zweig
-- löst kein Problem mehr, richtet aber Schaden an: wer sich beim Anlegen
-- selbst als Mitglied einträgt (das tut die Manager-Seite automatisch),
-- sieht das Team danach in JEDER aktiven Organisation. Genau deshalb tauchte
-- ein VOLK-WORK-Team wieder bei HB intern auf.
--
-- Jetzt entscheidet ausschliesslich die Organisation des Teams.
drop policy if exists "teams_select_all" on teams;
create policy "teams_select_all" on teams for select using (
  organization_id is not distinct from aktive_org(auth.uid())
);

-- Auch die Mitgliederliste eines Teams richtet sich nach dem TEAM, nicht
-- nach der Organisation der eingetragenen Person: sonst bliebe ein falsch
-- zugeordnetes Mitglied sichtbar, obwohl sein Team es nicht ist.
drop policy if exists "team_members_select_all" on team_members;
create policy "team_members_select_all" on team_members for select using (
  exists (
    select 1 from teams t
    where t.id = team_members.team_id
      and t.organization_id is not distinct from aktive_org(auth.uid())
  )
);

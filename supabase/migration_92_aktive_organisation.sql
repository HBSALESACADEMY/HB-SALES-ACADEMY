-- Ein Plattform-Admin-Konto ist kein Generalschlüssel mehr.
--
-- Bisher hing "is_platform_admin" als pauschales ODER an über hundert
-- Zugriffsregeln. Wer damit angemeldet war, sah die Daten ALLER
-- Organisationen — auch ohne Firmencode, auch unbeabsichtigt. Die aktive
-- Organisation stand nur im Browser (sessionStorage), die Datenbank kannte
-- sie überhaupt nicht und konnte deshalb gar nicht danach filtern.
--
-- Neu: die aktive Organisation wird serverseitig hinterlegt. Die Regeln
-- prüfen sie selbst — fremde Daten werden nicht mehr ausgeliefert, egal
-- welche Seite sie abfragt oder ob dort ein Filter vergessen wurde.
--
-- Etappe 1: Profile, Teams, Team-Mitglieder, Team-Ziele, Termine und
-- Anruf-Statistiken. Die übrigen Regeln folgen; bis dahin greift dort
-- weiterhin die alte, weitere Sichtbarkeit.
create table if not exists active_org (
  user_id uuid primary key references profiles(id) on delete cascade,
  organization_id uuid references organizations(id) on delete cascade,
  gesetzt_at timestamptz not null default now()
);

alter table active_org enable row level security;
drop policy if exists "active_org_select_own" on active_org;
create policy "active_org_select_own" on active_org for select using (auth.uid() = user_id);
drop policy if exists "active_org_insert_own" on active_org;
create policy "active_org_insert_own" on active_org for insert with check (auth.uid() = user_id);
drop policy if exists "active_org_update_own" on active_org;
create policy "active_org_update_own" on active_org for update using (auth.uid() = user_id);
drop policy if exists "active_org_delete_own" on active_org;
create policy "active_org_delete_own" on active_org for delete using (auth.uid() = user_id);

-- Welche Organisation sieht diese Person gerade?
--   Normale Konten: immer ihre eigene, unveränderlich.
--   Plattform-Admins: die per Firmencode gewählte — ohne Wahl die eigene.
create or replace function public.aktive_org(uid uuid)
returns uuid
language sql stable security definer as $$
  select case
    when coalesce((select is_platform_admin from profiles where id = uid), false)
      then coalesce(
        (select organization_id from active_org where user_id = uid),
        (select organization_id from profiles where id = uid))
    else (select organization_id from profiles where id = uid)
  end;
$$;

-- Gehört die Zielperson zur gerade aktiven Organisation? Ersetzt in den
-- Regeln unten sowohl same_org(...) als auch den Plattform-Admin-Zweig: für
-- normale Konten bedeutet es dasselbe wie bisher, für Plattform-Admins
-- schränkt es ein statt zu öffnen.
create or replace function public.sieht_person(ziel uuid)
returns boolean
language sql stable security definer as $$
  select (select organization_id from profiles where id = ziel)
         is not distinct from aktive_org(auth.uid());
$$;

-- --- profiles ---
-- Der alte dritte Zweig gab JEDES freigegebene Profil für jeden frei,
-- organisationsübergreifend. Er bleibt nur für Personen erhalten, die selbst
-- etwas bewusst mit allen Organisationen geteilt haben (community_posts mit
-- visibility='global') — sonst stünde im globalen Austausch ein Beitrag ohne
-- Namen.
create or replace function public.can_view_profile(target_id uuid, viewer_id uuid)
returns boolean
language sql stable security definer as $$
  select
    target_id = viewer_id
    or (select organization_id from profiles where id = target_id)
       is not distinct from aktive_org(viewer_id)
    or exists (select 1 from community_posts p where p.user_id = target_id and p.visibility = 'global')
$$;

-- --- teams ---
drop policy if exists "teams_select_all" on teams;
create policy "teams_select_all" on teams for select using (
  sieht_person(created_by)
  or exists (select 1 from team_members tm where tm.team_id = teams.id and tm.user_id = auth.uid())
);

-- --- team_members ---
drop policy if exists "team_members_select_all" on team_members;
create policy "team_members_select_all" on team_members for select using (sieht_person(user_id));

-- --- team_goals ---
drop policy if exists "team_goals_select_all" on team_goals;
create policy "team_goals_select_all" on team_goals for select using (sieht_person(manager_id));

-- --- leads ---
drop policy if exists "leads_select" on leads;
create policy "leads_select" on leads for select using (
  created_by = auth.uid()
  or (
    exists (select 1 from profiles where profiles.id = auth.uid()
            and (profiles.role = 'manager' or profiles.role = 'backend' or profiles.is_admin or profiles.is_platform_admin))
    and sieht_person(created_by)
  )
  -- Sonst wäre ein per Aufgabe/Erwähnung verlinkter fremder Termin für die
  -- zugewiesene/erwähnte Person unauffindbar (migration_77). Über die
  -- Hilfsfunktion statt direkt, sonst Endlosschleife (migration_79).
  or has_lead_task_or_mention(leads.id)
);

-- --- call_log_days ---
drop policy if exists "call_log_days_select_managers" on call_log_days;
create policy "call_log_days_select_managers" on call_log_days for select using (
  sieht_person(user_id)
  and (
    is_team_lead_of(user_id, auth.uid())
    or exists (select 1 from profiles where id = auth.uid() and (is_admin or is_platform_admin))
  )
);

-- Migration 14: Echte Mehrfach-Teams (statt fixer 1:1 profiles.manager_id-Zuordnung)
-- + manuelles Mentoring (die automatische XP-Zuordnung entfällt clientseitig).
-- Einmalig im Supabase SQL Editor ausführen.

-- ============================================================
-- 1. Neue Tabellen
-- ============================================================

create table if not exists teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists team_members (
  team_id uuid not null references teams(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (team_id, user_id)
);

alter table teams enable row level security;
alter table team_members enable row level security;

create policy "teams_select_all" on teams for select using (true);
create policy "teams_insert_managers" on teams for insert with check (
  exists (select 1 from profiles where id = auth.uid() and role = 'manager')
);
create policy "teams_update_own" on teams for update using (created_by = auth.uid());
create policy "teams_delete_own" on teams for delete using (created_by = auth.uid());

create policy "team_members_select_all" on team_members for select using (true);


-- ============================================================
-- 2. Hilfsfunktionen (SECURITY DEFINER)
-- ============================================================

create or replace function public.is_team_lead_of(target_id uuid, viewer_id uuid)
returns boolean
language sql stable security definer as $$
  select exists (
    select 1 from teams t join team_members tm on tm.team_id = t.id
    where t.created_by = viewer_id and tm.user_id = target_id
  );
$$;

create or replace function public.is_lead_of_team(tid uuid, uid uuid)
returns boolean
language sql stable security definer as $$
  select exists (select 1 from teams where id = tid and created_by = uid);
$$;

create or replace function public.shares_team_with(a uuid, b uuid)
returns boolean
language sql stable security definer as $$
  select exists (
    select 1 from team_members m1 join team_members m2 on m1.team_id = m2.team_id
    where m1.user_id = a and m2.user_id = b
  );
$$;

-- team_members-Policies, die die neuen Funktionen brauchen (nach deren Definition).
create policy "team_members_insert_lead" on team_members for insert with check (is_lead_of_team(team_id, auth.uid()));
create policy "team_members_delete_lead_or_self" on team_members for delete using (
  is_lead_of_team(team_id, auth.uid()) or auth.uid() = user_id
);


-- ============================================================
-- 3. profiles: manager_id-basierte Sichtbarkeit durch Team-Mitgliedschaft ersetzen
-- ============================================================

drop policy if exists "profiles_select_team" on profiles;

create or replace function public.can_view_profile(target_id uuid, viewer_id uuid)
returns boolean
language sql stable security definer as $$
  select
    target_id = viewer_id
    or exists (select 1 from profiles v where v.id = viewer_id and (v.is_admin = true or v.role = 'manager'))
    or exists (select 1 from profiles t where t.id = target_id and t.role = 'manager')
    or shares_team_with(viewer_id, target_id)
    or exists (select 1 from community_posts cp where cp.user_id = target_id)
    or exists (select 1 from community_comments cc where cc.user_id = target_id)
$$;


-- ============================================================
-- 4. Trainingsdaten: manager_id-Team-Policies auf is_team_lead_of umstellen
-- ============================================================

drop policy if exists "quiz_select_team" on quiz_results;
create policy "quiz_select_team" on quiz_results for select using (is_team_lead_of(user_id, auth.uid()));

drop policy if exists "exam_select_team" on exam_results;
create policy "exam_select_team" on exam_results for select using (is_team_lead_of(user_id, auth.uid()));

drop policy if exists "rp_select_team" on roleplay_sessions;
create policy "rp_select_team" on roleplay_sessions for select using (is_team_lead_of(user_id, auth.uid()));

-- Nebenbefund-Fix: diese drei Policies erlaubten bisher JEDEM Manager, ALLE
-- Mitarbeiter zu sehen statt nur das eigene Team. Admins sehen weiterhin alles.
drop policy if exists "call_log_days_select_managers" on call_log_days;
create policy "call_log_days_select_managers" on call_log_days for select using (
  is_team_lead_of(user_id, auth.uid())
  or exists (select 1 from profiles where id = auth.uid() and is_admin = true)
);

drop policy if exists "login_events_select_managers" on login_events;
create policy "login_events_select_managers" on login_events for select using (
  is_team_lead_of(user_id, auth.uid())
  or exists (select 1 from profiles where id = auth.uid() and is_admin = true)
);

drop policy if exists "login_attempts_select_managers" on login_attempts;
create policy "login_attempts_select_managers" on login_attempts for select using (
  is_team_lead_of(user_id, auth.uid())
  or exists (select 1 from profiles where id = auth.uid() and is_admin = true)
);


-- ============================================================
-- 5. team_goals / team_requests: team_id statt manager_id
-- ============================================================

alter table team_goals add column if not exists team_id uuid references teams(id) on delete cascade;
alter table team_requests add column if not exists team_id uuid references teams(id) on delete cascade;

drop policy if exists "team_goals_insert_manager" on team_goals;
create policy "team_goals_insert_manager" on team_goals for insert with check (is_lead_of_team(team_id, auth.uid()));

drop policy if exists "team_goals_update_manager" on team_goals;
create policy "team_goals_update_manager" on team_goals for update using (is_lead_of_team(team_id, auth.uid()));

drop policy if exists "team_requests_select_participant" on team_requests;
create policy "team_requests_select_participant" on team_requests for select using (
  auth.uid() = requester_id or is_lead_of_team(team_id, auth.uid())
);

drop policy if exists "team_requests_update_manager" on team_requests;
create policy "team_requests_update_manager" on team_requests for update using (
  auth.uid() = requester_id or is_lead_of_team(team_id, auth.uid())
);

drop policy if exists "team_requests_delete_participant" on team_requests;
create policy "team_requests_delete_participant" on team_requests for delete using (
  auth.uid() = requester_id or is_lead_of_team(team_id, auth.uid())
);

-- Alte Beschränkung entfernen: ein Manager kann jetzt mehrere Teams leiten,
-- daher darf dieselbe Person mehrere Teams desselben Managers anfragen können.
alter table team_requests drop constraint if exists team_requests_requester_id_manager_id_key;
alter table team_requests add constraint team_requests_requester_id_team_id_key unique (requester_id, team_id);


-- ============================================================
-- 6. Datenmigration: aus jeder bestehenden manager_id-Zuordnung ein Team erzeugen
-- ============================================================

insert into teams (name, created_by)
select coalesce(team_name, 'Team von ' || coalesce(full_name, 'Unbenannt')), id
from profiles where role = 'manager';

insert into team_members (team_id, user_id)
select t.id, t.created_by from teams t;

insert into team_members (team_id, user_id)
select t.id, p.id from profiles p join teams t on t.created_by = p.manager_id
where p.manager_id is not null
on conflict do nothing;

update team_goals g set team_id = t.id from teams t where t.created_by = g.manager_id and g.team_id is null;
update team_requests r set team_id = t.id from teams t where t.created_by = r.manager_id and r.team_id is null;

-- Migration 15: Echtes Multi-Tenant-SaaS (Organisationen + Branding pro Kunde)
-- Einmalig im Supabase SQL Editor ausführen.
--
-- Kernidee: jede Tabelle hat bereits eine Spalte, die auf profiles(id)
-- verweist (user_id, created_by, requester_id, ...). Die neue Funktion
-- same_org(a, b) vergleicht profiles.organization_id für zwei Personen —
-- damit lässt sich die komplette Mandanten-Trennung über Policy-Änderungen
-- durchsetzen, ohne jeder Tabelle eine eigene organization_id-Spalte zu geben.

-- ============================================================
-- 1. Neue Tabelle "organizations" + profiles.organization_id
-- ============================================================

create table if not exists organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  logo_url text,
  primary_color text,
  created_at timestamptz not null default now()
);

-- Muss VOR den organizations-Policies stehen, die diese Spalte lesen.
alter table profiles add column if not exists organization_id uuid references organizations(id);

alter table organizations enable row level security;

drop policy if exists "organizations_select_own" on organizations;
create policy "organizations_select_own" on organizations for select using (
  id = (select organization_id from profiles where id = auth.uid())
);
drop policy if exists "organizations_update_admin" on organizations;
create policy "organizations_update_admin" on organizations for update using (
  id = (select organization_id from profiles where id = auth.uid())
  and exists (select 1 from profiles where id = auth.uid() and is_admin = true)
);


-- ============================================================
-- 2. Kernfunktion same_org() + Absicherung
-- ============================================================

create or replace function public.same_org(a uuid, b uuid)
returns boolean
language sql stable security definer as $$
  select exists (
    select 1 from profiles pa, profiles pb
    where pa.id = a and pb.id = b and pa.organization_id = pb.organization_id
  );
$$;

-- Verhindert, dass ein Nutzer seine eigene organization_id selbst umbiegt.
-- auth.uid() ist bei Service-Role-Zugriffen (Houmans direkte SQL-Eingriffe) null.
create or replace function public.prevent_organization_change()
returns trigger as $$
begin
  if auth.uid() is not null and new.organization_id is distinct from old.organization_id then
    raise exception 'organization_id kann nicht selbst geändert werden.';
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists prevent_organization_change on profiles;
create trigger prevent_organization_change before update on profiles
for each row execute procedure public.prevent_organization_change();


-- ============================================================
-- 3. Signup: handle_new_user() verlangt jetzt einen Firmen-Code (org_slug)
-- ============================================================

create or replace function public.handle_new_user()
returns trigger as $$
declare org_id uuid;
begin
  select id into org_id from organizations where slug = new.raw_user_meta_data->>'org_slug';
  if org_id is null then
    raise exception 'Unbekannter Firmen-Code.';
  end if;
  insert into public.profiles (id, full_name, organization_id)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''), org_id);
  return new;
end;
$$ language plpgsql security definer;


-- ============================================================
-- 4. Hilfsfunktionen um same_org() erweitern (bestehende Logik bleibt,
--    wird nur zusätzlich mit "and same_org(...)" umschlossen)
-- ============================================================

create or replace function public.is_team_lead_of(target_id uuid, viewer_id uuid)
returns boolean
language sql stable security definer as $$
  select same_org(viewer_id, target_id) and exists (
    select 1 from teams t join team_members tm on tm.team_id = t.id
    where t.created_by = viewer_id and tm.user_id = target_id
  );
$$;

create or replace function public.is_lead_of_team(tid uuid, uid uuid)
returns boolean
language sql stable security definer as $$
  select exists (select 1 from teams where id = tid and created_by = uid);
$$;
-- (is_lead_of_team braucht keine Änderung: bezieht sich nur auf EIN Team,
-- dessen Lead per Definition bereits derselbe Nutzer ist wie der Prüfende.)

create or replace function public.shares_team_with(a uuid, b uuid)
returns boolean
language sql stable security definer as $$
  select same_org(a, b) and exists (
    select 1 from team_members m1 join team_members m2 on m1.team_id = m2.team_id
    where m1.user_id = a and m2.user_id = b
  );
$$;

-- Community ist bewusst unternehmensübergreifend (eine gemeinsame Sales-
-- Community für alle Organisationen) — wer dort aktiv war, ist daher IMMER
-- sichtbar, unabhängig von der Organisation. Alles andere bleibt same_org().
create or replace function public.can_view_profile(target_id uuid, viewer_id uuid)
returns boolean
language sql stable security definer as $$
  select
    target_id = viewer_id
    or exists (select 1 from community_posts cp where cp.user_id = target_id)
    or exists (select 1 from community_comments cc where cc.user_id = target_id)
    or (
      same_org(viewer_id, target_id)
      and (
        exists (select 1 from profiles v where v.id = viewer_id and (v.is_admin = true or v.role = 'manager'))
        or exists (select 1 from profiles t where t.id = target_id and t.role = 'manager')
        or shares_team_with(viewer_id, target_id)
      )
    )
$$;


-- ============================================================
-- 5. RLS: offene "select_all"-Policies auf same_org() umstellen
-- ============================================================

-- nav_items: eingebaute Einträge (is_builtin, kein Eigentümer) bleiben
-- bewusst plattformweit geteilt (bekannte Einschränkung, siehe README/Plan);
-- eigene Ordner (created_by gesetzt) werden pro Organisation getrennt.
drop policy if exists "nav_items_select_all" on nav_items;
create policy "nav_items_select_all" on nav_items for select using (
  is_builtin = true or same_org(created_by, auth.uid())
);
drop policy if exists "nav_items_update_managers" on nav_items;
create policy "nav_items_update_managers" on nav_items for update using (
  exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'manager')
  and (is_builtin = true or same_org(created_by, auth.uid()))
);
drop policy if exists "nav_items_delete_managers" on nav_items;
create policy "nav_items_delete_managers" on nav_items for delete using (
  exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'manager')
  and (is_builtin = true or same_org(created_by, auth.uid()))
);

drop policy if exists "custom_courses_select_all" on custom_courses;
create policy "custom_courses_select_all" on custom_courses for select using (same_org(created_by, auth.uid()));
drop policy if exists "custom_courses_update_managers" on custom_courses;
create policy "custom_courses_update_managers" on custom_courses for update using (
  exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'manager') and same_org(created_by, auth.uid())
);
drop policy if exists "custom_courses_delete_managers" on custom_courses;
create policy "custom_courses_delete_managers" on custom_courses for delete using (
  exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'manager') and same_org(created_by, auth.uid())
);

drop policy if exists "custom_modules_select_all" on custom_modules;
create policy "custom_modules_select_all" on custom_modules for select using (same_org(created_by, auth.uid()));
drop policy if exists "custom_modules_update_managers" on custom_modules;
create policy "custom_modules_update_managers" on custom_modules for update using (
  exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'manager') and same_org(created_by, auth.uid())
);
drop policy if exists "custom_modules_delete_managers" on custom_modules;
create policy "custom_modules_delete_managers" on custom_modules for delete using (
  exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'manager') and same_org(created_by, auth.uid())
);

drop policy if exists "kb_entries_select_approved" on kb_entries;
create policy "kb_entries_select_approved" on kb_entries for select using (status = 'approved' and same_org(created_by, auth.uid()));
drop policy if exists "kb_entries_select_managers_all" on kb_entries;
create policy "kb_entries_select_managers_all" on kb_entries for select using (
  exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'manager') and same_org(created_by, auth.uid())
);
drop policy if exists "kb_entries_update_managers" on kb_entries;
create policy "kb_entries_update_managers" on kb_entries for update using (
  exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'manager') and same_org(created_by, auth.uid())
);
drop policy if exists "kb_entries_delete_managers" on kb_entries;
create policy "kb_entries_delete_managers" on kb_entries for delete using (
  exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'manager') and same_org(created_by, auth.uid())
);

drop policy if exists "scripts_select_all" on scripts;
create policy "scripts_select_all" on scripts for select using (same_org(created_by, auth.uid()));
drop policy if exists "scripts_update_managers" on scripts;
create policy "scripts_update_managers" on scripts for update using (
  exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'manager') and same_org(created_by, auth.uid())
);
drop policy if exists "scripts_delete_managers" on scripts;
create policy "scripts_delete_managers" on scripts for delete using (
  exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'manager') and same_org(created_by, auth.uid())
);

drop policy if exists "guides_select_published" on guides;
create policy "guides_select_published" on guides for select using (is_published = true and same_org(created_by, auth.uid()));
drop policy if exists "guides_delete_own_or_manager" on guides;
create policy "guides_delete_own_or_manager" on guides for delete using (
  auth.uid() = created_by
  or (exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'manager') and same_org(created_by, auth.uid()))
);

drop policy if exists "flashcards_select_all" on flashcards;
create policy "flashcards_select_all" on flashcards for select using (same_org(created_by, auth.uid()));
drop policy if exists "flashcards_delete_managers" on flashcards;
create policy "flashcards_delete_managers" on flashcards for delete using (
  exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'manager') and same_org(created_by, auth.uid())
);

-- Community bleibt bewusst UNTERNEHMENSÜBERGREIFEND — nur Löschen/Moderieren
-- durch einen Manager bleibt weiter unten auf die eigene Organisation begrenzt.
drop policy if exists "community_groups_select_all" on community_groups;
create policy "community_groups_select_all" on community_groups for select using (true);
drop policy if exists "community_groups_delete_managers" on community_groups;
create policy "community_groups_delete_managers" on community_groups for delete using (
  exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'manager') and same_org(created_by, auth.uid())
);

drop policy if exists "community_posts_select_all" on community_posts;
create policy "community_posts_select_all" on community_posts for select using (true);
drop policy if exists "community_posts_delete_own_or_manager" on community_posts;
create policy "community_posts_delete_own_or_manager" on community_posts for delete using (
  auth.uid() = user_id
  or (exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'manager') and same_org(user_id, auth.uid()))
);

drop policy if exists "community_comments_select_all" on community_comments;
create policy "community_comments_select_all" on community_comments for select using (true);
drop policy if exists "community_comments_delete_own_or_manager" on community_comments;
create policy "community_comments_delete_own_or_manager" on community_comments for delete using (
  auth.uid() = user_id
  or (exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'manager') and same_org(user_id, auth.uid()))
);

drop policy if exists "community_kudos_select_all" on community_kudos;
create policy "community_kudos_select_all" on community_kudos for select using (true);

drop policy if exists "xp_log_select_all" on xp_log;
create policy "xp_log_select_all" on xp_log for select using (same_org(user_id, auth.uid()));

drop policy if exists "teams_select_all" on teams;
create policy "teams_select_all" on teams for select using (same_org(created_by, auth.uid()));

drop policy if exists "team_members_select_all" on team_members;
create policy "team_members_select_all" on team_members for select using (same_org(user_id, auth.uid()));

drop policy if exists "team_goals_select_all" on team_goals;
create policy "team_goals_select_all" on team_goals for select using (same_org(manager_id, auth.uid()));


-- ============================================================
-- 6. RLS: Admin-"sieht alles"-Policies auf die eigene Organisation eingrenzen
-- ============================================================

drop policy if exists "quiz_results_select_admin" on quiz_results;
create policy "quiz_results_select_admin" on quiz_results for select using (
  exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_admin = true) and same_org(user_id, auth.uid())
);
drop policy if exists "exam_results_select_admin" on exam_results;
create policy "exam_results_select_admin" on exam_results for select using (
  exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_admin = true) and same_org(user_id, auth.uid())
);
drop policy if exists "roleplay_sessions_select_admin" on roleplay_sessions;
create policy "roleplay_sessions_select_admin" on roleplay_sessions for select using (
  exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_admin = true) and same_org(user_id, auth.uid())
);
drop policy if exists "login_events_select_admin" on login_events;
create policy "login_events_select_admin" on login_events for select using (
  exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_admin = true) and same_org(user_id, auth.uid())
);
drop policy if exists "page_views_select_admin" on page_views;
create policy "page_views_select_admin" on page_views for select using (
  exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_admin = true) and same_org(user_id, auth.uid())
);

drop policy if exists "call_log_days_select_managers" on call_log_days;
create policy "call_log_days_select_managers" on call_log_days for select using (
  is_team_lead_of(user_id, auth.uid())
  or (exists (select 1 from profiles where id = auth.uid() and is_admin = true) and same_org(user_id, auth.uid()))
);
drop policy if exists "login_attempts_select_managers" on login_attempts;
create policy "login_attempts_select_managers" on login_attempts for select using (
  is_team_lead_of(user_id, auth.uid())
  or (exists (select 1 from profiles where id = auth.uid() and is_admin = true) and same_org(user_id, auth.uid()))
);


-- ============================================================
-- 7. RLS: Schreibzugriffe, die eine ANDERE konkrete Person betreffen,
--    bekommen zusätzlich eine same_org()-Prüfung für diese Person
-- ============================================================

drop policy if exists "team_members_insert_lead" on team_members;
create policy "team_members_insert_lead" on team_members for insert with check (
  is_lead_of_team(team_id, auth.uid()) and same_org(user_id, auth.uid())
);

drop policy if exists "mentor_pairs_insert_manager" on mentor_pairs;
create policy "mentor_pairs_insert_manager" on mentor_pairs for insert with check (
  auth.uid() = manager_id and same_org(mentor_id, auth.uid()) and same_org(mentee_id, auth.uid())
);

drop policy if exists "friendships_insert_own" on friendships;
create policy "friendships_insert_own" on friendships for insert with check (
  auth.uid() = requester_id
  and same_org(requester_id, addressee_id)
  and not exists (
    select 1 from blocks b
    where (b.blocker_id = friendships.addressee_id and b.blocked_id = friendships.requester_id)
       or (b.blocker_id = friendships.requester_id and b.blocked_id = friendships.addressee_id)
  )
);

drop policy if exists "blocks_insert_own" on blocks;
create policy "blocks_insert_own" on blocks for insert with check (
  auth.uid() = blocker_id and same_org(blocker_id, blocked_id)
);

drop policy if exists "duels_insert_challenger" on duels;
create policy "duels_insert_challenger" on duels for insert with check (
  auth.uid() = challenger_id and same_org(challenger_id, opponent_id)
);

drop policy if exists "chat_group_members_insert" on chat_group_members;
create policy "chat_group_members_insert" on chat_group_members for insert with check (
  (
    exists (select 1 from chat_groups g where g.id = chat_group_members.group_id and g.created_by = auth.uid())
    or exists (select 1 from chat_group_members m2 where m2.group_id = chat_group_members.group_id and m2.user_id = auth.uid())
  )
  and same_org(user_id, auth.uid())
);

drop policy if exists "team_requests_insert_own" on team_requests;
create policy "team_requests_insert_own" on team_requests for insert with check (
  auth.uid() = requester_id
  and exists (select 1 from teams t where t.id = team_requests.team_id and same_org(t.created_by, requester_id))
);


-- ============================================================
-- 8. Datenmigration: Bestandsdaten werden zur ersten Organisation
--    (Name/Slug vor dem Ausführen gerne anpassen)
-- ============================================================

insert into organizations (name, slug)
select 'HB Sales Academy', 'hb-intern'
where not exists (select 1 from organizations where slug = 'hb-intern');

update profiles set organization_id = (select id from organizations where slug = 'hb-intern')
where organization_id is null;

alter table profiles alter column organization_id set not null;


-- ============================================================
-- 9. Nav-Eintrag für die neue Organisations-Einstellungsseite
-- ============================================================

insert into nav_items (key, label, icon, route, is_builtin, requires_manager, order_index)
values ('admin-organization', 'Organisation', 'target', '/admin/organization', true, true, 12)
on conflict (key) do nothing;

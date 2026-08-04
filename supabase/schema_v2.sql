-- =============================================================================
-- HB Sales Academy — konsolidiertes Schema (Stand: 2026-07-28)
-- =============================================================================
-- Einmalig im Supabase SQL Editor eines NEUEN Projekts ausführen, um die
-- komplette Datenbank aufzubauen.
--
-- Diese Datei wurde durch Introspektion der echten Produktions-Datenbank
-- erzeugt (siehe supabase/README.md) und ersetzt schema.sql + migration_2
-- bis migration_11 (jetzt in supabase/archive/), die zusammen nur einen
-- Bruchteil der tatsächlichen Struktur abbildeten. Der Großteil der Tabellen
-- war nie als Datei im Repo, sondern wurde direkt per SQL-Editor angelegt.
--
-- Falls gegen die BESTEHENDE Produktions-DB ausgeführt: alle CREATE TABLE-
-- Befehle sind mit "if not exists" abgesichert und daher ungefährlich.
-- Der Abschnitt "REALTIME" am Ende schlägt dort fehl (Tabellen sind schon
-- Mitglied der Publikation) — das ist ungefährlich, einfach ignorieren.
-- =============================================================================


-- =============================================================================
-- 0. ORGANIZATIONS (Mandanten-Grenze für Multi-Tenant/White-Label)
-- =============================================================================
-- Jede Organisation ist ein zahlender Kunde mit eigenem Branding. Neue
-- Organisationen legt Houman per SQL an (siehe README) — kein Selbstbedienungs-
-- Signup. Mitarbeiter registrieren sich mit dem Firmen-Code (slug) der
-- Organisation über das normale Signup-Formular.

create table if not exists organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  logo_url text,
  primary_color text,
  secondary_color text,
  tertiary_color text,
  -- Vollständiges Theme über den Marken-Verlauf hinaus — alle nullable,
  -- leer = heutiges HB-Sales-Academy-Design bleibt Standard.
  background_color text,
  surface_color text,
  text_color text,
  muted_color text,
  border_color text,
  created_at timestamptz not null default now()
);

-- =============================================================================
-- 1. PROFILES (Basis-Tabelle, erweitert auth.users)
-- =============================================================================

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role text not null default 'rep' check (role in ('rep', 'manager', 'trainer', 'backend')),
  is_admin boolean not null default false,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  manager_id uuid references profiles(id) on delete set null,
  organization_id uuid not null references organizations(id),
  xp integer not null default 0,
  created_at timestamptz not null default now(),
  last_seen_community_at timestamptz not null default now(),
  streak_count integer not null default 0,
  last_challenge_date date,
  avatar_url text,
  bio text,
  company_name text,
  role_title text,
  website text,
  instagram text,
  linkedin text,
  phone text,
  contact_visibility jsonb not null default '{}'::jsonb,
  dashboard_prefs jsonb not null default '{}'::jsonb,
  sidebar_prefs jsonb not null default '{}'::jsonb,
  onboarding_dismissed boolean not null default false,
  team_name text,
  welcome_seen boolean not null default false,
  leaderboard_opt_out boolean not null default false,
  is_platform_admin boolean not null default false,
  agb_accepted_at timestamptz
);

-- Auto-create a profile row whenever a new auth user signs up. Verlangt einen
-- gültigen Firmen-Code (org_slug) im Signup-Formular, sonst schlägt die
-- Registrierung sauber fehl statt eine Organisation-lose Zeile zu erzeugen.
-- Tabellen bewusst mit "public." qualifiziert und search_path fest gesetzt:
-- Supabase Auth führt diese Funktion als eigene, enger eingeschränkte
-- Datenbank-Rolle (supabase_auth_admin) aus, deren search_path "public"
-- NICHT automatisch enthält (siehe migration_21).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare org_id uuid;
begin
  select id into org_id from public.organizations where slug = new.raw_user_meta_data->>'org_slug';
  if org_id is null then
    raise exception 'Unbekannter Firmen-Code.';
  end if;
  insert into public.profiles (id, full_name, organization_id, agb_accepted_at)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    org_id,
    case when (new.raw_user_meta_data->>'agb_accepted')::boolean is true then now() else null end
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

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


-- =============================================================================
-- 2. LERNEN: Kurse, Prüfungen, Rollenspiel, Wissensdatenbank, Flashcards
-- =============================================================================

create table if not exists quiz_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  course_id text not null,
  module_id text not null,
  mc_score integer not null default 0,
  mc_total integer not null default 0,
  open_score integer not null default 0,
  open_total integer not null default 0,
  open_feedback jsonb,
  created_at timestamptz not null default now()
);

create table if not exists exam_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  course_id text not null,
  score integer not null,
  total integer not null,
  passed boolean not null,
  created_at timestamptz not null default now()
);

create table if not exists roleplay_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  persona_id text not null,
  scenario_id text not null,
  difficulty text not null,
  turns integer not null default 0,
  transcript jsonb,
  detected_principles jsonb,
  evaluation text,
  evaluation_score integer,
  evaluation_detail jsonb,
  created_at timestamptz not null default now()
);

create table if not exists nav_items (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  label text not null,
  icon text not null default 'book',
  route text,
  is_builtin boolean not null default false,
  requires_manager boolean not null default false,
  visible boolean not null default true,
  order_index integer not null default 0,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  -- Explizit gesetzt (nicht aus created_by/profiles.organization_id
  -- abgeleitet) — sonst gehört ein Ordner, den ein Plattform-Admin per
  -- Firmencode für eine andere Organisation anlegt, fälschlich zu dessen
  -- eigener Heimat-Organisation (siehe migration_53).
  organization_id uuid references organizations(id) on delete cascade
);

create table if not exists custom_courses (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  color text not null default 'amber' check (color in ('amber', 'teal', 'coral', 'violet')),
  order_index integer not null default 0,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  nav_item_id uuid references nav_items(id) on delete cascade,
  organization_id uuid references organizations(id) on delete cascade
);

create table if not exists custom_modules (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references custom_courses(id) on delete cascade,
  title text not null,
  content text,
  video_url text,
  file_url text,
  file_name text,
  order_index integer not null default 0,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists kb_entries (
  id uuid primary key default gen_random_uuid(),
  tag text not null default 'Sonstiges',
  title text not null,
  body text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  source text not null default 'manual' check (source in ('manual', 'ai_roleplay')),
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists scripts (
  id uuid primary key default gen_random_uuid(),
  category text not null default 'Allgemein',
  title text not null,
  body text not null,
  file_url text,
  file_name text,
  visibility text not null default 'org' check (visibility in ('org', 'private')),
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists flashcards (
  id uuid primary key default gen_random_uuid(),
  tag text not null default 'Allgemein',
  front text not null,
  back text not null,
  file_url text,
  file_name text,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists flashcard_progress (
  user_id uuid not null references profiles(id) on delete cascade,
  card_id uuid not null references flashcards(id) on delete cascade,
  ease_factor real not null default 2.5,
  interval_days integer not null default 1,
  next_review_date date not null default current_date,
  last_result text,
  updated_at timestamptz not null default now(),
  primary key (user_id, card_id)
);

-- Personalisierter Lernpfad: nach den 7 festen Grundkursen generiert die KI
-- fortlaufend vollständige, individuelle Zusatzkurse (gleiche Tiefe wie die
-- Grundkurse: mehrere Module mit Theorie+MC+offener Frage, plus
-- Abschlussprüfung), zugeschnitten auf die erkannten Schwächen des
-- jeweiligen Vertrieblers (siehe pages/api/personal-course-generate.js und
-- lib/resolveCourse.js).
create table if not exists personal_courses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  title text not null,
  description text not null,
  accent text not null default '#7B2FF7',
  focus_area text not null,
  modules jsonb not null,
  exam_case jsonb not null,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists daily_challenge_completions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  challenge_date date not null,
  correct boolean not null,
  created_at timestamptz not null default now(),
  unique (user_id, challenge_date)
);

create table if not exists guides (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('cold_call', 'closing_call')),
  title text not null,
  input jsonb not null default '{}'::jsonb,
  content jsonb not null,
  is_published boolean not null default false,
  created_by uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists duels (
  id uuid primary key default gen_random_uuid(),
  challenger_id uuid not null references profiles(id) on delete cascade,
  opponent_id uuid not null references profiles(id) on delete cascade,
  question_ids jsonb not null,
  challenger_score integer,
  opponent_score integer,
  status text not null default 'pending' check (status in ('pending', 'challenger_done', 'completed')),
  created_at timestamptz not null default now()
);


-- =============================================================================
-- 3. COMMUNITY & SOZIALES: Feed, Gruppen, Freunde, Nachrichten
-- =============================================================================

create table if not exists community_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists community_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now(),
  group_id uuid references community_groups(id) on delete set null,
  attachment_url text,
  attachment_type text,
  -- 'org' = nur für die eigene Organisation sichtbar (Standard), 'global' =
  -- bewusst mit allen Organisationen geteilt.
  visibility text not null default 'org' check (visibility in ('org', 'global'))
);

create table if not exists community_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references community_posts(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now()
);

create table if not exists community_kudos (
  post_id uuid not null references community_posts(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

-- Einzeln likebare Kommentare (z.B. für "Top-Antwort" bei Einwandbehandlung) —
-- eigene Tabelle statt Erweiterung von community_kudos, damit dessen
-- Struktur (post_id NOT NULL, PK auf post_id+user_id) unangetastet bleibt.
create table if not exists community_comment_kudos (
  comment_id uuid not null references community_comments(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);

create table if not exists friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references profiles(id) on delete cascade,
  addressee_id uuid not null references profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  unique (requester_id, addressee_id)
);

create table if not exists blocks (
  id uuid primary key default gen_random_uuid(),
  blocker_id uuid not null references profiles(id) on delete cascade,
  blocked_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (blocker_id, blocked_id)
);

create table if not exists chat_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists chat_group_members (
  group_id uuid not null references chat_groups(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create table if not exists direct_messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references profiles(id) on delete cascade,
  recipient_id uuid references profiles(id) on delete cascade,
  content text not null,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  attachment_path text,
  attachment_type text,
  attachment_name text,
  group_id uuid references chat_groups(id) on delete cascade
);

create table if not exists conversation_reads (
  user_id uuid not null references profiles(id) on delete cascade,
  target_id uuid not null,
  is_group boolean not null default false,
  last_read_at timestamptz not null default now(),
  primary key (user_id, target_id, is_group)
);


-- =============================================================================
-- 4. TEAM & GAMIFICATION
-- =============================================================================

create table if not exists xp_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  amount integer not null,
  created_at timestamptz not null default now()
);

-- Echte Mehrfach-Teams: eine Person kann in mehreren Teams gleichzeitig sein.
-- Der Lead eines Teams ist teams.created_by (bewusst kein separates
-- is_lead-Flag in team_members — ein Lead pro Team reicht für v1).
-- profiles.manager_id (oben) bleibt als Altlast bestehen, wird aber von
-- keiner Policy/keinem Code-Pfad mehr für Berechtigungen genutzt.
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

create table if not exists team_goals (
  id uuid primary key default gen_random_uuid(),
  manager_id uuid not null references profiles(id) on delete cascade,
  team_id uuid references teams(id) on delete cascade,
  title text not null,
  metric text not null check (metric in ('roleplay', 'quiz', 'daily_challenge')),
  target_count integer not null,
  week_start date not null,
  created_at timestamptz not null default now()
);

create table if not exists team_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references profiles(id) on delete cascade,
  manager_id uuid not null references profiles(id) on delete cascade,
  team_id uuid references teams(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  unique (requester_id, team_id)
);

create table if not exists mentor_pairs (
  id uuid primary key default gen_random_uuid(),
  mentor_id uuid not null references profiles(id) on delete cascade,
  mentee_id uuid not null references profiles(id) on delete cascade,
  manager_id uuid not null references profiles(id) on delete cascade,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists call_log_days (
  user_id uuid not null references profiles(id) on delete cascade,
  log_date date not null,
  counts jsonb not null default '{}'::jsonb,
  reasons jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, log_date)
);

-- Leads/Termine — beim "Terminiert"-Klick im Call Tracker erfasste
-- Kundendaten (siehe public/tools/call-tracker.html und pages/termine.js).
create table if not exists leads (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references profiles(id) on delete cascade,
  name text not null,
  phone text,
  email text,
  company text,
  website text,
  is_decision_maker boolean not null default false,
  notes text,
  recording_path text,
  appointment_at timestamptz,
  status text not null default 'geplant' check (status in ('geplant', 'wahrgenommen', 'abgesagt')),
  outcome text check (outcome in ('kunde', 'follow_up', 'absage')),
  created_at timestamptz not null default now()
);

-- Frei hochladbare Anruf-Aufnahmen (nicht an einen Lead gebunden) — jedes
-- Team-Mitglied kann eine eigene Aufnahme hochladen, wählt Sichtbarkeit
-- (Organisation oder nur für sich selbst), die KI wertet automatisch aus.
create table if not exists call_recordings (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references profiles(id) on delete cascade,
  label text,
  recording_path text not null,
  file_name text,
  visibility text not null default 'private' check (visibility in ('org', 'private', 'team_lead')),
  status text not null default 'pending' check (status in ('pending', 'evaluated', 'failed')),
  evaluation_score integer,
  evaluation_summary text,
  evaluation_detail jsonb,
  outcome text check (outcome in ('positiv', 'negativ')),
  lead_id uuid references leads(id) on delete set null,
  created_at timestamptz not null default now()
);


-- =============================================================================
-- 5. ADMIN, ANALYTICS & DROSSELUNG
-- =============================================================================

create table if not exists login_attempts (
  id uuid primary key default gen_random_uuid(),
  email text,
  user_id uuid references profiles(id) on delete set null,
  success boolean not null,
  created_at timestamptz not null default now()
);

create table if not exists login_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists page_views (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  path text not null,
  created_at timestamptz not null default now()
);

-- Nur der Server (Service-Role-Key) greift hierauf zu, daher keine Policies nötig —
-- RLS ohne Policies sperrt den Zugriff über den öffentlichen Schlüssel komplett ab.
create table if not exists ai_request_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now()
);


-- =============================================================================
-- 6. HILFSFUNKTIONEN (SECURITY DEFINER, umgehen RLS gezielt für eine Prüfung)
-- =============================================================================

-- Verhindert "infinite recursion" (42P17): die eigene SELECT-Policy von chat_group_members
-- fragt hierüber ab, statt sich selbst rekursiv zu lesen.
create or replace function public.is_group_member(gid uuid, uid uuid)
returns boolean
language sql stable security definer as $$
  select exists (select 1 from chat_group_members where group_id = gid and user_id = uid);
$$;

-- Vergleicht die organization_id zweier Personen — die Mandanten-Grenze,
-- auf der praktisch alle anderen Sichtbarkeits-Prüfungen aufbauen.
-- "is not distinct from" statt "=": NULL = NULL ist in SQL nie true, würde
-- also same_org(x, x) für ein Profil OHNE organization_id (z.B. ein
-- Plattform-Admin-Konto ohne feste Heimat-Organisation) sogar beim Vergleich
-- mit sich selbst fehlschlagen lassen.
create or replace function public.same_org(a uuid, b uuid)
returns boolean
language sql stable security definer as $$
  select exists (
    select 1 from profiles pa, profiles pb
    where pa.id = a and pb.id = b and pa.organization_id is not distinct from pb.organization_id
  );
$$;

-- Ein Team hat genau einen Lead (teams.created_by). Prüft, ob viewer_id
-- ein Team leitet, in dem target_id Mitglied ist — für Trainingsdaten
-- (quiz/exam/roleplay/call_log_days/login_events/login_attempts).
create or replace function public.is_team_lead_of(target_id uuid, viewer_id uuid)
returns boolean
language sql stable security definer as $$
  select same_org(viewer_id, target_id) and exists (
    select 1 from teams t join team_members tm on tm.team_id = t.id
    where t.created_by = viewer_id and tm.user_id = target_id
  );
$$;

-- Prüft, ob uid der Lead eines bestimmten Teams ist (team_goals, team_requests).
-- Braucht keine same_org()-Ergänzung: bezieht sich auf EIN Team, dessen Lead
-- per Definition bereits derselbe Nutzer ist wie der Prüfende.
create or replace function public.is_lead_of_team(tid uuid, uid uuid)
returns boolean
language sql stable security definer as $$
  select exists (select 1 from teams where id = tid and created_by = uid);
$$;

-- Prüft, ob uid IRGENDEIN Team leitet (unabhängig davon, welches) — genutzt,
-- um Teamleads dieselben Inhalte-Verwaltungsrechte zu geben wie Manager/
-- Trainer (Skripte, eigene Kurse/Module, Flashcards, Wissensdatenbank).
create or replace function public.is_team_lead(uid uuid)
returns boolean
language sql stable security definer as $$
  select exists (select 1 from teams where created_by = uid);
$$;

-- Prüft, ob zwei Personen mindestens ein gemeinsames Team haben (für can_view_profile).
create or replace function public.shares_team_with(a uuid, b uuid)
returns boolean
language sql stable security definer as $$
  select same_org(a, b) and exists (
    select 1 from team_members m1 join team_members m2 on m1.team_id = m2.team_id
    where m1.user_id = a and m2.user_id = b
  );
$$;

-- Mitglieder der eigenen Organisation sind füreinander uneingeschränkt
-- sichtbar (auch mit status='pending' — sonst sehen Manager/Admins neue
-- Nutzeranfragen nicht). Zusätzlich ist jedes freigegebene Profil
-- grundsätzlich auffindbar (nötig für die globale Suche/Community: "Profil
-- ansehen" MUSS schon vor einer Freundschaftsanfrage möglich sein).
create or replace function public.can_view_profile(target_id uuid, viewer_id uuid)
returns boolean
language sql stable security definer as $$
  select
    target_id = viewer_id
    or same_org(target_id, viewer_id)
    or exists (select 1 from profiles t where t.id = target_id and t.status = 'approved')
$$;

-- Atomarer XP-Zuwachs + Protokoll-Eintrag, aufgerufen via supabase.rpc('increment_xp', ...)
create or replace function public.increment_xp(uid uuid, amount integer)
returns void
language plpgsql as $$
begin
  -- GREATEST(0, ...) verhindert negatives XP — wichtig, seit XP-Verlust
  -- (z.B. beim Reißen einer Streak) genutzt wird, nicht nur XP-Zuwachs.
  update profiles set xp = greatest(0, xp + amount) where id = uid;
  insert into xp_log (user_id, amount) values (uid, amount);
end;
$$;


-- =============================================================================
-- 7. ROW LEVEL SECURITY
-- =============================================================================

alter table organizations enable row level security;
alter table profiles enable row level security;
alter table quiz_results enable row level security;
alter table exam_results enable row level security;
alter table roleplay_sessions enable row level security;
alter table nav_items enable row level security;
alter table custom_courses enable row level security;
alter table custom_modules enable row level security;
alter table kb_entries enable row level security;
alter table scripts enable row level security;
alter table guides enable row level security;
alter table flashcards enable row level security;
alter table flashcard_progress enable row level security;
alter table personal_courses enable row level security;
alter table daily_challenge_completions enable row level security;
alter table duels enable row level security;
alter table community_groups enable row level security;
alter table community_posts enable row level security;
alter table community_comments enable row level security;
alter table community_kudos enable row level security;
alter table community_comment_kudos enable row level security;
alter table friendships enable row level security;
alter table blocks enable row level security;
alter table chat_groups enable row level security;
alter table chat_group_members enable row level security;
alter table direct_messages enable row level security;
alter table conversation_reads enable row level security;
alter table xp_log enable row level security;
alter table teams enable row level security;
alter table team_members enable row level security;
alter table team_goals enable row level security;
alter table team_requests enable row level security;
alter table mentor_pairs enable row level security;
alter table call_log_days enable row level security;
alter table leads enable row level security;
alter table call_recordings enable row level security;
alter table login_attempts enable row level security;
alter table login_events enable row level security;
alter table page_views enable row level security;
alter table ai_request_log enable row level security;

-- --- organizations ---
drop policy if exists "organizations_select_own" on organizations;
create policy "organizations_select_own" on organizations for select using (
  id = (select organization_id from profiles where id = auth.uid())
  or exists (select 1 from profiles where id = auth.uid() and is_platform_admin = true)
);
drop policy if exists "organizations_update_admin" on organizations;
create policy "organizations_update_admin" on organizations for update using (
  (
    id = (select organization_id from profiles where id = auth.uid())
    and exists (select 1 from profiles where id = auth.uid() and is_admin = true)
  )
  or exists (select 1 from profiles where id = auth.uid() and is_platform_admin = true)
);
drop policy if exists "organizations_insert_platform_admin" on organizations;
create policy "organizations_insert_platform_admin" on organizations for insert with check (
  exists (select 1 from profiles where id = auth.uid() and is_platform_admin = true)
);
drop policy if exists "organizations_delete_platform_admin" on organizations;
create policy "organizations_delete_platform_admin" on organizations for delete using (
  exists (select 1 from profiles where id = auth.uid() and is_platform_admin = true)
);

-- --- profiles ---
drop policy if exists "profiles_select_own" on profiles;
create policy "profiles_select_own" on profiles for select using (auth.uid() = id);

-- profiles_select_team entfällt: can_view_profile() deckt die Sichtbarkeit
-- (eigene Organisation uneingeschränkt + jedes freigegebene Profil) ab.
drop policy if exists "profiles_select_team" on profiles;

drop policy if exists "profiles_select_scoped" on profiles;
create policy "profiles_select_scoped" on profiles for select using (can_view_profile(id, auth.uid()));

drop policy if exists "profiles_update_own" on profiles;
create policy "profiles_update_own" on profiles for update using (auth.uid() = id);

-- --- quiz_results ---
drop policy if exists "quiz_insert_own" on quiz_results;
create policy "quiz_insert_own" on quiz_results for insert with check (auth.uid() = user_id);
drop policy if exists "quiz_select_own" on quiz_results;
create policy "quiz_select_own" on quiz_results for select using (auth.uid() = user_id);
drop policy if exists "quiz_select_team" on quiz_results;
create policy "quiz_select_team" on quiz_results for select using (is_team_lead_of(user_id, auth.uid()));
drop policy if exists "quiz_results_select_admin" on quiz_results;
create policy "quiz_results_select_admin" on quiz_results for select using (
  exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_platform_admin)
  or (
    exists (select 1 from profiles where profiles.id = auth.uid() and (profiles.role = 'manager' or profiles.role = 'backend' or profiles.is_admin))
    and same_org(user_id, auth.uid())
  )
);

-- --- exam_results ---
drop policy if exists "exam_insert_own" on exam_results;
create policy "exam_insert_own" on exam_results for insert with check (auth.uid() = user_id);
drop policy if exists "exam_select_own" on exam_results;
create policy "exam_select_own" on exam_results for select using (auth.uid() = user_id);
drop policy if exists "exam_select_team" on exam_results;
create policy "exam_select_team" on exam_results for select using (is_team_lead_of(user_id, auth.uid()));
drop policy if exists "exam_results_select_admin" on exam_results;
create policy "exam_results_select_admin" on exam_results for select using (
  exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_platform_admin)
  or (
    exists (select 1 from profiles where profiles.id = auth.uid() and (profiles.role = 'manager' or profiles.role = 'backend' or profiles.is_admin))
    and same_org(user_id, auth.uid())
  )
);

-- --- roleplay_sessions ---
drop policy if exists "rp_insert_own" on roleplay_sessions;
create policy "rp_insert_own" on roleplay_sessions for insert with check (auth.uid() = user_id);
drop policy if exists "rp_select_own" on roleplay_sessions;
create policy "rp_select_own" on roleplay_sessions for select using (auth.uid() = user_id);
drop policy if exists "rp_select_team" on roleplay_sessions;
create policy "rp_select_team" on roleplay_sessions for select using (is_team_lead_of(user_id, auth.uid()));
drop policy if exists "roleplay_sessions_select_admin" on roleplay_sessions;
create policy "roleplay_sessions_select_admin" on roleplay_sessions for select using (
  exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_platform_admin)
  or (
    exists (select 1 from profiles where profiles.id = auth.uid() and (profiles.role = 'manager' or profiles.role = 'backend' or profiles.is_admin))
    and same_org(user_id, auth.uid())
  )
);

-- --- nav_items ---
-- organization_id ist EXPLIZIT gesetzt (nicht aus created_by abgeleitet) —
-- sonst gehört ein Ordner, den ein Plattform-Admin per Firmencode für Org X
-- anlegt, fälschlich zur eigenen Heimat-Organisation des Plattform-Admins
-- und verschwindet für Org X wieder (same_org() verglich bisher IMMER die
-- Heimat-Organisation des Erstellers, nicht die gerade aktive).
drop policy if exists "nav_items_select_all" on nav_items;
create policy "nav_items_select_all" on nav_items for select using (
  is_builtin = true
  or organization_id = (select organization_id from profiles where profiles.id = auth.uid())
  or exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_platform_admin)
);
drop policy if exists "nav_items_write_managers" on nav_items;
create policy "nav_items_write_managers" on nav_items for insert with check (
  exists (select 1 from profiles where profiles.id = auth.uid() and (profiles.role in ('manager', 'trainer') or profiles.is_admin or profiles.is_platform_admin))
);
drop policy if exists "nav_items_update_managers" on nav_items;
create policy "nav_items_update_managers" on nav_items for update using (
  exists (select 1 from profiles where profiles.id = auth.uid() and (profiles.role in ('manager', 'trainer') or profiles.is_admin or profiles.is_platform_admin))
  and (
    is_builtin = true
    or organization_id = (select organization_id from profiles where profiles.id = auth.uid())
    or exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_platform_admin)
  )
);
drop policy if exists "nav_items_delete_managers" on nav_items;
create policy "nav_items_delete_managers" on nav_items for delete using (
  exists (select 1 from profiles where profiles.id = auth.uid() and (profiles.role in ('manager', 'trainer') or profiles.is_admin or profiles.is_platform_admin))
  and (
    is_builtin = true
    or organization_id = (select organization_id from profiles where profiles.id = auth.uid())
    or exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_platform_admin)
  )
);

-- --- custom_courses ---
-- organization_id ist EXPLIZIT gesetzt (nicht aus created_by abgeleitet) —
-- gleicher Grund wie bei nav_items: same_org() verglich bisher die Heimat-
-- Organisation des/der Erstellenden statt der gerade aktiven Organisation.
drop policy if exists "custom_courses_select_all" on custom_courses;
create policy "custom_courses_select_all" on custom_courses for select using (
  organization_id = (select organization_id from profiles where profiles.id = auth.uid())
  or exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_platform_admin)
);
drop policy if exists "custom_courses_write_managers" on custom_courses;
create policy "custom_courses_write_managers" on custom_courses for insert with check (
  exists (select 1 from profiles where profiles.id = auth.uid() and (profiles.role in ('manager', 'trainer') or profiles.is_admin or profiles.is_platform_admin))
  or is_team_lead(auth.uid())
);
drop policy if exists "custom_courses_update_managers" on custom_courses;
create policy "custom_courses_update_managers" on custom_courses for update using (
  (
    exists (select 1 from profiles where profiles.id = auth.uid() and (profiles.role in ('manager', 'trainer') or profiles.is_admin or profiles.is_platform_admin))
    or is_team_lead(auth.uid())
  ) and (
    organization_id = (select organization_id from profiles where profiles.id = auth.uid())
    or exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_platform_admin)
  )
);
drop policy if exists "custom_courses_delete_managers" on custom_courses;
create policy "custom_courses_delete_managers" on custom_courses for delete using (
  (
    exists (select 1 from profiles where profiles.id = auth.uid() and (profiles.role in ('manager', 'trainer') or profiles.is_admin or profiles.is_platform_admin))
    or is_team_lead(auth.uid())
  ) and (
    organization_id = (select organization_id from profiles where profiles.id = auth.uid())
    or exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_platform_admin)
  )
);

-- --- custom_modules ---
-- Organisation wird über den ÜBERGEORDNETEN Kurs geprüft (custom_courses.
-- organization_id), nicht über same_org(created_by,...) — ein Modul gehört
-- immer zur Organisation seines Kurses, unabhängig davon, wer es angelegt hat.
drop policy if exists "custom_modules_select_all" on custom_modules;
create policy "custom_modules_select_all" on custom_modules for select using (
  exists (
    select 1 from custom_courses cc where cc.id = custom_modules.course_id
    and cc.organization_id = (select organization_id from profiles where profiles.id = auth.uid())
  )
  or exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_platform_admin)
);
drop policy if exists "custom_modules_write_managers" on custom_modules;
create policy "custom_modules_write_managers" on custom_modules for insert with check (
  exists (select 1 from profiles where profiles.id = auth.uid() and (profiles.role in ('manager', 'trainer') or profiles.is_admin or profiles.is_platform_admin))
  or is_team_lead(auth.uid())
);
drop policy if exists "custom_modules_update_managers" on custom_modules;
create policy "custom_modules_update_managers" on custom_modules for update using (
  (
    exists (select 1 from profiles where profiles.id = auth.uid() and (profiles.role in ('manager', 'trainer') or profiles.is_admin or profiles.is_platform_admin))
    or is_team_lead(auth.uid())
  ) and (
    exists (
      select 1 from custom_courses cc where cc.id = custom_modules.course_id
      and cc.organization_id = (select organization_id from profiles where profiles.id = auth.uid())
    )
    or exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_platform_admin)
  )
);
drop policy if exists "custom_modules_delete_managers" on custom_modules;
create policy "custom_modules_delete_managers" on custom_modules for delete using (
  (
    exists (select 1 from profiles where profiles.id = auth.uid() and (profiles.role in ('manager', 'trainer') or profiles.is_admin or profiles.is_platform_admin))
    or is_team_lead(auth.uid())
  ) and (
    exists (
      select 1 from custom_courses cc where cc.id = custom_modules.course_id
      and cc.organization_id = (select organization_id from profiles where profiles.id = auth.uid())
    )
    or exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_platform_admin)
  )
);

-- --- kb_entries ---
drop policy if exists "kb_entries_select_approved" on kb_entries;
create policy "kb_entries_select_approved" on kb_entries for select using (status = 'approved' and same_org(created_by, auth.uid()));
drop policy if exists "kb_entries_select_managers_all" on kb_entries;
create policy "kb_entries_select_managers_all" on kb_entries for select using (
  (
    exists (select 1 from profiles where profiles.id = auth.uid() and (profiles.role in ('manager', 'trainer') or profiles.is_admin or profiles.is_platform_admin))
    or is_team_lead(auth.uid())
  ) and same_org(created_by, auth.uid())
);
drop policy if exists "kb_entries_insert_pending" on kb_entries;
create policy "kb_entries_insert_pending" on kb_entries for insert with check (status = 'pending');
drop policy if exists "kb_entries_update_managers" on kb_entries;
create policy "kb_entries_update_managers" on kb_entries for update using (
  (
    exists (select 1 from profiles where profiles.id = auth.uid() and (profiles.role in ('manager', 'trainer') or profiles.is_admin or profiles.is_platform_admin))
    or is_team_lead(auth.uid())
  ) and same_org(created_by, auth.uid())
);
drop policy if exists "kb_entries_delete_managers" on kb_entries;
create policy "kb_entries_delete_managers" on kb_entries for delete using (
  (
    exists (select 1 from profiles where profiles.id = auth.uid() and (profiles.role in ('manager', 'trainer') or profiles.is_admin or profiles.is_platform_admin))
    or is_team_lead(auth.uid())
  ) and same_org(created_by, auth.uid())
);

-- --- scripts ---
drop policy if exists "scripts_select_all" on scripts;
create policy "scripts_select_all" on scripts for select using (
  created_by = auth.uid()
  or (visibility = 'org' and same_org(created_by, auth.uid()))
);
drop policy if exists "scripts_insert_managers" on scripts;
create policy "scripts_insert_managers" on scripts for insert with check (
  exists (select 1 from profiles where profiles.id = auth.uid() and (profiles.role = 'manager' or profiles.is_admin or profiles.is_platform_admin))
  or is_team_lead(auth.uid())
);
drop policy if exists "scripts_update_managers" on scripts;
create policy "scripts_update_managers" on scripts for update using (
  (
    exists (select 1 from profiles where profiles.id = auth.uid() and (profiles.role = 'manager' or profiles.is_admin or profiles.is_platform_admin))
    or is_team_lead(auth.uid())
  ) and same_org(created_by, auth.uid())
);
drop policy if exists "scripts_delete_managers" on scripts;
create policy "scripts_delete_managers" on scripts for delete using (
  (
    exists (select 1 from profiles where profiles.id = auth.uid() and (profiles.role = 'manager' or profiles.is_admin or profiles.is_platform_admin))
    or is_team_lead(auth.uid())
  ) and same_org(created_by, auth.uid())
);

-- --- guides ---
drop policy if exists "guides_select_own" on guides;
create policy "guides_select_own" on guides for select using (auth.uid() = created_by);
drop policy if exists "guides_select_published" on guides;
create policy "guides_select_published" on guides for select using (is_published = true and same_org(created_by, auth.uid()));
drop policy if exists "guides_insert_own" on guides;
create policy "guides_insert_own" on guides for insert with check (auth.uid() = created_by);
drop policy if exists "guides_update_own" on guides;
create policy "guides_update_own" on guides for update using (auth.uid() = created_by);
drop policy if exists "guides_delete_own_or_manager" on guides;
create policy "guides_delete_own_or_manager" on guides for delete using (
  auth.uid() = created_by
  or (exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'manager') and same_org(created_by, auth.uid()))
);

-- --- flashcards ---
drop policy if exists "flashcards_select_all" on flashcards;
create policy "flashcards_select_all" on flashcards for select using (same_org(created_by, auth.uid()));
drop policy if exists "flashcards_write_managers" on flashcards;
create policy "flashcards_write_managers" on flashcards for insert with check (
  exists (select 1 from profiles where profiles.id = auth.uid() and (profiles.role in ('manager', 'trainer') or profiles.is_admin or profiles.is_platform_admin))
  or is_team_lead(auth.uid())
);
drop policy if exists "flashcards_delete_managers" on flashcards;
create policy "flashcards_delete_managers" on flashcards for delete using (
  (
    exists (select 1 from profiles where profiles.id = auth.uid() and (profiles.role in ('manager', 'trainer') or profiles.is_admin or profiles.is_platform_admin))
    or is_team_lead(auth.uid())
  ) and same_org(created_by, auth.uid())
);

-- --- flashcard_progress ---
drop policy if exists "fp_select_own" on flashcard_progress;
create policy "fp_select_own" on flashcard_progress for select using (auth.uid() = user_id);
drop policy if exists "fp_upsert_own" on flashcard_progress;
create policy "fp_upsert_own" on flashcard_progress for insert with check (auth.uid() = user_id);
drop policy if exists "fp_update_own" on flashcard_progress;
create policy "fp_update_own" on flashcard_progress for update using (auth.uid() = user_id);

-- --- personal_courses ---
drop policy if exists "personal_courses_select" on personal_courses;
create policy "personal_courses_select" on personal_courses for select using (
  user_id = auth.uid()
  or exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_platform_admin)
  or (
    exists (select 1 from profiles where profiles.id = auth.uid() and (profiles.role = 'manager' or profiles.is_admin))
    and same_org(user_id, auth.uid())
  )
);
drop policy if exists "personal_courses_insert" on personal_courses;
create policy "personal_courses_insert" on personal_courses for insert with check (
  user_id = auth.uid()
  or exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_platform_admin)
  or (
    exists (select 1 from profiles where profiles.id = auth.uid() and (profiles.role = 'manager' or profiles.is_admin))
    and same_org(user_id, auth.uid())
  )
);

-- --- daily_challenge_completions ---
drop policy if exists "dcc_select_own" on daily_challenge_completions;
create policy "dcc_select_own" on daily_challenge_completions for select using (auth.uid() = user_id);
drop policy if exists "dcc_insert_own" on daily_challenge_completions;
create policy "dcc_insert_own" on daily_challenge_completions for insert with check (auth.uid() = user_id);

-- --- duels ---
drop policy if exists "duels_select_participant" on duels;
create policy "duels_select_participant" on duels for select using (auth.uid() = challenger_id or auth.uid() = opponent_id);
drop policy if exists "duels_insert_challenger" on duels;
create policy "duels_insert_challenger" on duels for insert with check (
  auth.uid() = challenger_id and same_org(challenger_id, opponent_id)
);
drop policy if exists "duels_update_participant" on duels;
create policy "duels_update_participant" on duels for update using (auth.uid() = challenger_id or auth.uid() = opponent_id);

-- --- community_groups ---
drop policy if exists "community_groups_select_all" on community_groups;
-- Community bleibt bewusst UNTERNEHMENSÜBERGREIFEND (eine gemeinsame Sales-
-- Community für alle Organisationen) — nur Löschen/Moderieren durch einen
-- Manager bleibt auf die eigene Organisation begrenzt.
create policy "community_groups_select_all" on community_groups for select using (true);
drop policy if exists "community_groups_write_managers" on community_groups;
create policy "community_groups_write_managers" on community_groups for insert with check (
  exists (
    select 1 from profiles
    where profiles.id = auth.uid()
      and (profiles.role in ('manager', 'trainer') or profiles.is_admin or profiles.is_platform_admin)
  )
);
drop policy if exists "community_groups_delete_managers" on community_groups;
create policy "community_groups_delete_managers" on community_groups for delete using (
  exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_platform_admin)
  or (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and (profiles.role in ('manager', 'trainer') or profiles.is_admin)
    )
    and same_org(created_by, auth.uid())
  )
);

-- --- community_posts ---
-- visibility='org' (Standard) ist nur für die eigene Organisation sichtbar;
-- visibility='global' bewusst für alle. Komplett getrennte Communities.
drop policy if exists "community_posts_select_all" on community_posts;
create policy "community_posts_select_all" on community_posts for select using (
  visibility = 'global' or same_org(user_id, auth.uid())
);
drop policy if exists "community_posts_insert_own" on community_posts;
create policy "community_posts_insert_own" on community_posts for insert with check (auth.uid() = user_id);
drop policy if exists "community_posts_delete_own_or_manager" on community_posts;
create policy "community_posts_delete_own_or_manager" on community_posts for delete using (
  auth.uid() = user_id
  or (exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'manager') and same_org(user_id, auth.uid()))
);

-- --- community_comments --- (Sichtbarkeit folgt dem übergeordneten Beitrag)
drop policy if exists "community_comments_select_all" on community_comments;
create policy "community_comments_select_all" on community_comments for select using (
  exists (
    select 1 from community_posts cp where cp.id = community_comments.post_id
    and (cp.visibility = 'global' or same_org(cp.user_id, auth.uid()))
  )
);
drop policy if exists "community_comments_insert_own" on community_comments;
create policy "community_comments_insert_own" on community_comments for insert with check (
  auth.uid() = user_id
  and exists (
    select 1 from community_posts cp where cp.id = community_comments.post_id
    and (cp.visibility = 'global' or same_org(cp.user_id, auth.uid()))
  )
);
drop policy if exists "community_comments_delete_own_or_manager" on community_comments;
create policy "community_comments_delete_own_or_manager" on community_comments for delete using (
  auth.uid() = user_id
  or (exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'manager') and same_org(user_id, auth.uid()))
);

-- --- community_kudos --- (Sichtbarkeit folgt dem übergeordneten Beitrag)
drop policy if exists "community_kudos_select_all" on community_kudos;
create policy "community_kudos_select_all" on community_kudos for select using (
  exists (
    select 1 from community_posts cp where cp.id = community_kudos.post_id
    and (cp.visibility = 'global' or same_org(cp.user_id, auth.uid()))
  )
);
drop policy if exists "community_kudos_insert_own" on community_kudos;
create policy "community_kudos_insert_own" on community_kudos for insert with check (
  auth.uid() = user_id
  and exists (
    select 1 from community_posts cp where cp.id = community_kudos.post_id
    and (cp.visibility = 'global' or same_org(cp.user_id, auth.uid()))
  )
);
drop policy if exists "community_kudos_delete_own" on community_kudos;
create policy "community_kudos_delete_own" on community_kudos for delete using (auth.uid() = user_id);

-- --- community_comment_kudos --- (Sichtbarkeit folgt dem übergeordneten Beitrag)
drop policy if exists "community_comment_kudos_select_all" on community_comment_kudos;
create policy "community_comment_kudos_select_all" on community_comment_kudos for select using (
  exists (
    select 1 from community_comments cc
    join community_posts cp on cp.id = cc.post_id
    where cc.id = community_comment_kudos.comment_id
    and (cp.visibility = 'global' or same_org(cp.user_id, auth.uid()))
  )
);
drop policy if exists "community_comment_kudos_insert_own" on community_comment_kudos;
create policy "community_comment_kudos_insert_own" on community_comment_kudos for insert with check (
  auth.uid() = user_id
  and exists (
    select 1 from community_comments cc
    join community_posts cp on cp.id = cc.post_id
    where cc.id = community_comment_kudos.comment_id
    and (cp.visibility = 'global' or same_org(cp.user_id, auth.uid()))
  )
);
drop policy if exists "community_comment_kudos_delete_own" on community_comment_kudos;
create policy "community_comment_kudos_delete_own" on community_comment_kudos for delete using (auth.uid() = user_id);

-- --- friendships ---
drop policy if exists "friendships_select_own" on friendships;
create policy "friendships_select_own" on friendships for select using (auth.uid() = requester_id or auth.uid() = addressee_id);
drop policy if exists "friendships_insert_own" on friendships;
create policy "friendships_insert_own" on friendships for insert with check (
  auth.uid() = requester_id
  and not exists (
    select 1 from blocks b
    where (b.blocker_id = friendships.addressee_id and b.blocked_id = friendships.requester_id)
       or (b.blocker_id = friendships.requester_id and b.blocked_id = friendships.addressee_id)
  )
);
drop policy if exists "friendships_update_participant" on friendships;
create policy "friendships_update_participant" on friendships for update using (auth.uid() = addressee_id or auth.uid() = requester_id);
drop policy if exists "friendships_delete_participant" on friendships;
create policy "friendships_delete_participant" on friendships for delete using (auth.uid() = requester_id or auth.uid() = addressee_id);

-- --- blocks ---
drop policy if exists "blocks_select_own" on blocks;
create policy "blocks_select_own" on blocks for select using (auth.uid() = blocker_id);
drop policy if exists "blocks_insert_own" on blocks;
create policy "blocks_insert_own" on blocks for insert with check (
  auth.uid() = blocker_id and same_org(blocker_id, blocked_id)
);
drop policy if exists "blocks_delete_own" on blocks;
create policy "blocks_delete_own" on blocks for delete using (auth.uid() = blocker_id);

-- --- chat_groups ---
drop policy if exists "chat_groups_insert_own" on chat_groups;
create policy "chat_groups_insert_own" on chat_groups for insert with check (auth.uid() = created_by);
drop policy if exists "chat_groups_select_creator" on chat_groups;
create policy "chat_groups_select_creator" on chat_groups for select using (auth.uid() = created_by);
drop policy if exists "chat_groups_select_member" on chat_groups;
create policy "chat_groups_select_member" on chat_groups for select using (exists (select 1 from chat_group_members m where m.group_id = chat_groups.id and m.user_id = auth.uid()));

-- --- chat_group_members ---
-- (chat_groups_select_creator existiert zusätzlich zur breiteren Mitglieder-Policy,
--  weil sonst der Ersteller seine eigene neue Gruppe nicht sofort lesen kann,
--  bevor der erste Mitgliedschafts-Eintrag existiert — Henne-Ei-Problem.)
drop policy if exists "chat_group_members_select_member" on chat_group_members;
create policy "chat_group_members_select_member" on chat_group_members for select using (is_group_member(group_id, auth.uid()));
drop policy if exists "chat_group_members_insert" on chat_group_members;
create policy "chat_group_members_insert" on chat_group_members for insert with check (
  (
    exists (select 1 from chat_groups g where g.id = chat_group_members.group_id and g.created_by = auth.uid())
    or exists (select 1 from chat_group_members m2 where m2.group_id = chat_group_members.group_id and m2.user_id = auth.uid())
  )
  and same_org(user_id, auth.uid())
);
drop policy if exists "chat_group_members_delete_own" on chat_group_members;
create policy "chat_group_members_delete_own" on chat_group_members for delete using (auth.uid() = user_id);

-- --- direct_messages ---
drop policy if exists "dm_select_own" on direct_messages;
create policy "dm_select_own" on direct_messages for select using (
  auth.uid() = sender_id or auth.uid() = recipient_id
  or (group_id is not null and is_group_member(group_id, auth.uid()))
);
-- Innerhalb der eigenen Organisation ist Chatten ohne Freundschaftsanfrage
-- erlaubt (same_org). Organisationsübergreifend bleibt eine akzeptierte
-- Freundschaftsanfrage nötig. Blockierungen gelten in beiden Fällen.
drop policy if exists "dm_insert_friends" on direct_messages;
create policy "dm_insert_friends" on direct_messages for insert with check (
  auth.uid() = sender_id
  and (
    (group_id is not null and is_group_member(group_id, auth.uid()))
    or (
      group_id is null and recipient_id is not null
      and (
        same_org(sender_id, recipient_id)
        or exists (
          select 1 from friendships f
          where f.status = 'accepted'
            and ((f.requester_id = direct_messages.sender_id and f.addressee_id = direct_messages.recipient_id)
              or (f.requester_id = direct_messages.recipient_id and f.addressee_id = direct_messages.sender_id))
        )
      )
      and not exists (
        select 1 from blocks b
        where (b.blocker_id = direct_messages.recipient_id and b.blocked_id = direct_messages.sender_id)
           or (b.blocker_id = direct_messages.sender_id and b.blocked_id = direct_messages.recipient_id)
      )
    )
  )
);
drop policy if exists "dm_update_recipient_marks_read" on direct_messages;
create policy "dm_update_recipient_marks_read" on direct_messages for update using (auth.uid() = recipient_id);

-- --- conversation_reads ---
drop policy if exists "conversation_reads_select_own" on conversation_reads;
create policy "conversation_reads_select_own" on conversation_reads for select using (auth.uid() = user_id);
drop policy if exists "conversation_reads_select_dm_partner" on conversation_reads;
create policy "conversation_reads_select_dm_partner" on conversation_reads for select using (is_group = false and target_id = auth.uid());
drop policy if exists "conversation_reads_select_group_peers" on conversation_reads;
create policy "conversation_reads_select_group_peers" on conversation_reads for select using (is_group = true and is_group_member(target_id, auth.uid()));
drop policy if exists "conversation_reads_upsert_own" on conversation_reads;
create policy "conversation_reads_upsert_own" on conversation_reads for insert with check (auth.uid() = user_id);
drop policy if exists "conversation_reads_update_own" on conversation_reads;
create policy "conversation_reads_update_own" on conversation_reads for update using (auth.uid() = user_id);

-- --- xp_log ---
drop policy if exists "xp_log_select_all" on xp_log;
create policy "xp_log_select_all" on xp_log for select using (same_org(user_id, auth.uid()));
drop policy if exists "xp_log_insert_own" on xp_log;
create policy "xp_log_insert_own" on xp_log for insert with check (auth.uid() = user_id);

-- --- teams ---
-- is_platform_admin-Bypass: same_org() vergleicht sonst die Heimat-
-- Organisation des Plattform-Admin-Kontos statt der per Firmencode gerade
-- aktiv verwalteten Organisation (gleicher Grund wie bei nav_items/
-- custom_courses, migration_53).
drop policy if exists "teams_select_all" on teams;
create policy "teams_select_all" on teams for select using (
  same_org(created_by, auth.uid())
  or exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_platform_admin)
);
drop policy if exists "teams_insert_managers" on teams;
create policy "teams_insert_managers" on teams for insert with check (
  exists (select 1 from profiles where id = auth.uid() and role = 'manager')
);
drop policy if exists "teams_update_own" on teams;
create policy "teams_update_own" on teams for update using (created_by = auth.uid());
drop policy if exists "teams_delete_own" on teams;
create policy "teams_delete_own" on teams for delete using (created_by = auth.uid());

-- --- team_members ---
drop policy if exists "team_members_select_all" on team_members;
create policy "team_members_select_all" on team_members for select using (
  same_org(user_id, auth.uid())
  or exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_platform_admin)
);
drop policy if exists "team_members_insert_lead" on team_members;
create policy "team_members_insert_lead" on team_members for insert with check (
  is_lead_of_team(team_id, auth.uid())
  and (
    same_org(user_id, auth.uid())
    or exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_platform_admin)
  )
);
drop policy if exists "team_members_delete_lead_or_self" on team_members;
create policy "team_members_delete_lead_or_self" on team_members for delete using (
  is_lead_of_team(team_id, auth.uid()) or auth.uid() = user_id
);

-- --- team_goals ---
drop policy if exists "team_goals_select_all" on team_goals;
create policy "team_goals_select_all" on team_goals for select using (same_org(manager_id, auth.uid()));
drop policy if exists "team_goals_insert_manager" on team_goals;
create policy "team_goals_insert_manager" on team_goals for insert with check (is_lead_of_team(team_id, auth.uid()));
drop policy if exists "team_goals_update_manager" on team_goals;
create policy "team_goals_update_manager" on team_goals for update using (is_lead_of_team(team_id, auth.uid()));

-- --- team_requests ---
drop policy if exists "team_requests_select_participant" on team_requests;
create policy "team_requests_select_participant" on team_requests for select using (
  auth.uid() = requester_id or is_lead_of_team(team_id, auth.uid())
);
drop policy if exists "team_requests_insert_own" on team_requests;
create policy "team_requests_insert_own" on team_requests for insert with check (
  auth.uid() = requester_id
  and exists (select 1 from teams t where t.id = team_requests.team_id and same_org(t.created_by, requester_id))
);
drop policy if exists "team_requests_update_manager" on team_requests;
create policy "team_requests_update_manager" on team_requests for update using (
  auth.uid() = requester_id or is_lead_of_team(team_id, auth.uid())
);
drop policy if exists "team_requests_delete_participant" on team_requests;
create policy "team_requests_delete_participant" on team_requests for delete using (
  auth.uid() = requester_id or is_lead_of_team(team_id, auth.uid())
);

-- --- mentor_pairs ---
drop policy if exists "mentor_pairs_select_participant" on mentor_pairs;
create policy "mentor_pairs_select_participant" on mentor_pairs for select using (auth.uid() = mentor_id or auth.uid() = mentee_id or auth.uid() = manager_id);
drop policy if exists "mentor_pairs_insert_manager" on mentor_pairs;
create policy "mentor_pairs_insert_manager" on mentor_pairs for insert with check (
  auth.uid() = manager_id
  and (
    (same_org(mentor_id, auth.uid()) and same_org(mentee_id, auth.uid()))
    or exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_platform_admin)
  )
);
drop policy if exists "mentor_pairs_update_manager" on mentor_pairs;
create policy "mentor_pairs_update_manager" on mentor_pairs for update using (auth.uid() = manager_id);

-- --- call_log_days ---
drop policy if exists "call_log_days_select_own" on call_log_days;
create policy "call_log_days_select_own" on call_log_days for select using (auth.uid() = user_id);
drop policy if exists "call_log_days_select_managers" on call_log_days;
create policy "call_log_days_select_managers" on call_log_days for select using (
  is_team_lead_of(user_id, auth.uid())
  or (exists (select 1 from profiles where id = auth.uid() and is_admin = true) and same_org(user_id, auth.uid()))
);
drop policy if exists "call_log_days_upsert_own" on call_log_days;
create policy "call_log_days_upsert_own" on call_log_days for insert with check (auth.uid() = user_id);
drop policy if exists "call_log_days_update_own" on call_log_days;
create policy "call_log_days_update_own" on call_log_days for update using (auth.uid() = user_id);

-- --- leads ---
drop policy if exists "leads_select" on leads;
create policy "leads_select" on leads for select using (
  created_by = auth.uid()
  or exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_platform_admin)
  or (
    exists (select 1 from profiles where profiles.id = auth.uid() and (profiles.role = 'manager' or profiles.role = 'backend' or profiles.is_admin))
    and same_org(created_by, auth.uid())
  )
);
drop policy if exists "leads_insert_own" on leads;
create policy "leads_insert_own" on leads for insert with check (created_by = auth.uid());
drop policy if exists "leads_update" on leads;
create policy "leads_update" on leads for update using (
  created_by = auth.uid()
  or exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_platform_admin)
  or (
    exists (select 1 from profiles where profiles.id = auth.uid() and (profiles.role = 'manager' or profiles.role = 'backend' or profiles.is_admin))
    and same_org(created_by, auth.uid())
  )
);
drop policy if exists "leads_delete" on leads;
create policy "leads_delete" on leads for delete using (
  created_by = auth.uid()
  or exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_platform_admin)
  or (
    exists (select 1 from profiles where profiles.id = auth.uid() and (profiles.role = 'manager' or profiles.is_admin))
    and same_org(created_by, auth.uid())
  )
);

-- --- call_recordings ---
drop policy if exists "call_recordings_select" on call_recordings;
create policy "call_recordings_select" on call_recordings for select using (
  created_by = auth.uid()
  or (visibility = 'org' and same_org(created_by, auth.uid()))
  or (
    visibility = 'team_lead'
    and (
      is_team_lead_of(created_by, auth.uid())
      or (
        same_org(created_by, auth.uid())
        and exists (select 1 from profiles where profiles.id = auth.uid() and (profiles.role = 'manager' or profiles.role = 'backend' or profiles.is_admin))
      )
    )
  )
  or exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_platform_admin)
);
drop policy if exists "call_recordings_insert_own" on call_recordings;
create policy "call_recordings_insert_own" on call_recordings for insert with check (created_by = auth.uid());
drop policy if exists "call_recordings_update_own" on call_recordings;
create policy "call_recordings_update_own" on call_recordings for update using (created_by = auth.uid());
drop policy if exists "call_recordings_delete" on call_recordings;
create policy "call_recordings_delete" on call_recordings for delete using (
  created_by = auth.uid()
  or exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_platform_admin)
  or (
    exists (select 1 from profiles where profiles.id = auth.uid() and (profiles.role = 'manager' or profiles.is_admin))
    and same_org(created_by, auth.uid())
  )
);

-- --- login_attempts ---
drop policy if exists "login_attempts_insert_anyone" on login_attempts;
create policy "login_attempts_insert_anyone" on login_attempts for insert with check (true);
drop policy if exists "login_attempts_select_managers" on login_attempts;
create policy "login_attempts_select_managers" on login_attempts for select using (
  is_team_lead_of(user_id, auth.uid())
  or (exists (select 1 from profiles where id = auth.uid() and is_admin = true) and same_org(user_id, auth.uid()))
);

-- --- login_events ---
drop policy if exists "login_events_insert_own" on login_events;
create policy "login_events_insert_own" on login_events for insert with check (auth.uid() = user_id);
drop policy if exists "login_events_select_managers" on login_events;
create policy "login_events_select_managers" on login_events for select using (is_team_lead_of(user_id, auth.uid()));
drop policy if exists "login_events_select_admin" on login_events;
create policy "login_events_select_admin" on login_events for select using (
  exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_platform_admin)
  or (
    exists (select 1 from profiles where profiles.id = auth.uid() and (profiles.role = 'manager' or profiles.role = 'backend' or profiles.is_admin))
    and same_org(user_id, auth.uid())
  )
);

-- --- page_views ---
drop policy if exists "page_views_insert_own" on page_views;
create policy "page_views_insert_own" on page_views for insert with check (auth.uid() = user_id);
drop policy if exists "page_views_select_admin" on page_views;
create policy "page_views_select_admin" on page_views for select using (
  exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_platform_admin)
  or (
    exists (select 1 from profiles where profiles.id = auth.uid() and (profiles.role = 'manager' or profiles.role = 'backend' or profiles.is_admin))
    and same_org(user_id, auth.uid())
  )
);

-- --- ai_request_log ---
-- bewusst keine Policies: RLS ohne Policies sperrt anon/authenticated komplett aus,
-- nur der Service-Role-Key (Server) kommt durch.


-- =============================================================================
-- 8. REALTIME (nur nötig bei einem FRISCHEN Projekt — bei bestehender DB
--    sind diese Tabellen schon Mitglied und die Zeilen schlagen fehl,
--    was hier ungefährlich ist und ignoriert werden kann)
-- =============================================================================

alter publication supabase_realtime add table public.profiles;
alter publication supabase_realtime add table public.community_posts;
alter publication supabase_realtime add table public.community_comments;
alter publication supabase_realtime add table public.community_kudos;
alter publication supabase_realtime add table public.direct_messages;
alter publication supabase_realtime add table public.friendships;
alter publication supabase_realtime add table public.conversation_reads;


-- =============================================================================
-- 9. STORAGE
-- =============================================================================
-- Hinweis: schema_v2.sql wurde rein aus den Postgres-Tabellen introspektiert
-- und bildet die ÜBRIGEN, älteren Storage-Buckets (avatars, course-videos,
-- dm-uploads, community-uploads) bislang NICHT ab — die existieren nur in
-- supabase/archive/migration_9/7/11 usw. Nur der neue org-logos-Bucket ist
-- hier vollständig, weil er Teil dieser Änderung ist.

insert into storage.buckets (id, name, public) values ('org-logos', 'org-logos', true)
on conflict (id) do nothing;

-- Privat (public=false) — Anruf-Aufnahmen zu Leads, nur über signierte URLs
-- erreichbar. Eigener Ordner pro Nutzer (auth.uid()), siehe RLS unten.
insert into storage.buckets (id, name, public) values ('lead-recordings', 'lead-recordings', false)
on conflict (id) do nothing;

drop policy if exists "lead_recordings_own_folder_all" on storage.objects;
create policy "lead_recordings_own_folder_all" on storage.objects for all using (
  bucket_id = 'lead-recordings' and (storage.foldername(name))[1] = auth.uid()::text
) with check (
  bucket_id = 'lead-recordings' and (storage.foldername(name))[1] = auth.uid()::text
);

-- Privater Bucket für frei hochgeladene Team-Recordings — Wiedergabe für
-- andere (bei visibility='org') läuft über eine signierte URL, nicht über
-- direkten Storage-Zugriff.
insert into storage.buckets (id, name, public) values ('call-recordings', 'call-recordings', false)
on conflict (id) do nothing;

drop policy if exists "call_recordings_own_folder_all" on storage.objects;
create policy "call_recordings_own_folder_all" on storage.objects for all using (
  bucket_id = 'call-recordings' and (storage.foldername(name))[1] = auth.uid()::text
) with check (
  bucket_id = 'call-recordings' and (storage.foldername(name))[1] = auth.uid()::text
);

-- Öffentlich lesbar wie course-videos/org-logos — Skript-Anhänge sind
-- geteilte Team-Inhalte, keine sensiblen Kundendaten.
insert into storage.buckets (id, name, public) values ('script-files', 'script-files', true)
on conflict (id) do nothing;

drop policy if exists "script_files_public_read" on storage.objects;
create policy "script_files_public_read" on storage.objects for select using (bucket_id = 'script-files');

drop policy if exists "script_files_manager_upload" on storage.objects;
create policy "script_files_manager_upload" on storage.objects for insert with check (
  bucket_id = 'script-files'
  and (storage.foldername(name))[1] = auth.uid()::text
  and exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'manager')
);

-- Gemeinsamer Bucket für Kurs-Modul- und Flashcard-Anhänge.
insert into storage.buckets (id, name, public) values ('content-files', 'content-files', true)
on conflict (id) do nothing;

drop policy if exists "content_files_public_read" on storage.objects;
create policy "content_files_public_read" on storage.objects for select using (bucket_id = 'content-files');

drop policy if exists "content_files_manager_upload" on storage.objects;
create policy "content_files_manager_upload" on storage.objects for insert with check (
  bucket_id = 'content-files'
  and (storage.foldername(name))[1] = auth.uid()::text
  and exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role in ('manager', 'trainer'))
);

drop policy if exists "org_logos_public_read" on storage.objects;
create policy "org_logos_public_read" on storage.objects for select using (bucket_id = 'org-logos');

drop policy if exists "org_logos_admin_upload" on storage.objects;
create policy "org_logos_admin_upload" on storage.objects for insert with check (
  bucket_id = 'org-logos'
  and (
    exists (
      select 1 from profiles where id = auth.uid() and is_admin = true
      and organization_id::text = (storage.foldername(name))[1]
    )
    or exists (select 1 from profiles where id = auth.uid() and is_platform_admin = true)
  )
);

drop policy if exists "org_logos_admin_update" on storage.objects;
create policy "org_logos_admin_update" on storage.objects for update using (
  bucket_id = 'org-logos'
  and (
    exists (
      select 1 from profiles where id = auth.uid() and is_admin = true
      and organization_id::text = (storage.foldername(name))[1]
    )
    or exists (select 1 from profiles where id = auth.uid() and is_platform_admin = true)
  )
);


-- =============================================================================
-- Manuell: jemanden zum Manager machen und Team-Mitglieder zuordnen
-- =============================================================================
--   update profiles set role = 'manager' where id = '<manager-uuid>';
--   update profiles set manager_id = '<manager-uuid>' where id = '<rep-uuid>';
--   update profiles set is_admin = true where id = '<admin-uuid>';
--   update profiles set is_platform_admin = true where id = '<dein-eigenes-uuid>'; -- nur einmalig, für dich selbst

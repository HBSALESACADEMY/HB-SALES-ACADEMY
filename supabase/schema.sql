-- HB Sales Academy — Supabase Schema
-- Run this once in the Supabase SQL Editor of a new project.

-- 1. Profiles (extends auth.users)
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role text not null default 'rep' check (role in ('rep', 'manager')),
  manager_id uuid references profiles(id) on delete set null,
  xp integer not null default 0,
  created_at timestamptz not null default now()
);

-- 2. Quiz results (per module attempt, multiple-choice + open-ended case questions)
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

-- 3. Exam results (course-level, gates the next course)
create table if not exists exam_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  course_id text not null,
  score integer not null,
  total integer not null,
  passed boolean not null,
  created_at timestamptz not null default now()
);

-- 4. Roleplay sessions
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
  created_at timestamptz not null default now()
);

-- Auto-create a profile row whenever a new auth user signs up
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''));
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Atomic XP increment, callable via supabase.rpc('increment_xp', ...)
-- security invoker so it still runs as the calling user and respects RLS
create or replace function public.increment_xp(uid uuid, amount integer)
returns void as $$
begin
  update profiles set xp = xp + amount where id = uid;
end;
$$ language plpgsql security invoker;

-- Row Level Security
alter table profiles enable row level security;
alter table quiz_results enable row level security;
alter table exam_results enable row level security;
alter table roleplay_sessions enable row level security;

-- Profiles: a user can read/update their own row; a manager can read team members' rows
create policy "profiles_select_own" on profiles
  for select using (auth.uid() = id);

create policy "profiles_select_team" on profiles
  for select using (manager_id = auth.uid());

create policy "profiles_update_own" on profiles
  for update using (auth.uid() = id);

-- Quiz results: own rows insert/select; manager can select team rows
create policy "quiz_insert_own" on quiz_results
  for insert with check (auth.uid() = user_id);

create policy "quiz_select_own" on quiz_results
  for select using (auth.uid() = user_id);

create policy "quiz_select_team" on quiz_results
  for select using (
    user_id in (select id from profiles where manager_id = auth.uid())
  );

-- Exam results: same pattern
create policy "exam_insert_own" on exam_results
  for insert with check (auth.uid() = user_id);

create policy "exam_select_own" on exam_results
  for select using (auth.uid() = user_id);

create policy "exam_select_team" on exam_results
  for select using (
    user_id in (select id from profiles where manager_id = auth.uid())
  );

-- Roleplay sessions: same pattern
create policy "rp_insert_own" on roleplay_sessions
  for insert with check (auth.uid() = user_id);

create policy "rp_select_own" on roleplay_sessions
  for select using (auth.uid() = user_id);

create policy "rp_select_team" on roleplay_sessions
  for select using (
    user_id in (select id from profiles where manager_id = auth.uid())
  );

-- To make someone a manager and assign reports to them, run manually e.g.:
--   update profiles set role = 'manager' where id = '<manager-uuid>';
--   update profiles set manager_id = '<manager-uuid>' where id = '<rep-uuid>';

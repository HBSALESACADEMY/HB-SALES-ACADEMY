-- Migration 22: Anmeldeversuche (auch fehlgeschlagene) für Manager & Admin
-- Einmalig im Supabase SQL Editor ausführen.

create table if not exists login_attempts (
  id uuid primary key default gen_random_uuid(),
  email text,
  user_id uuid references profiles(id) on delete set null,
  success boolean not null,
  created_at timestamptz not null default now()
);

alter table login_attempts enable row level security;

-- Auch fehlgeschlagene Versuche müssen protokolliert werden können, bevor überhaupt
-- eine Sitzung existiert — daher ist Insert bewusst offen (nur Insert, kein Select).
create policy "login_attempts_insert_anyone" on login_attempts for insert with check (true);

create policy "login_attempts_select_managers" on login_attempts for select
  using (exists (select 1 from profiles where id = auth.uid() and (role = 'manager' or is_admin = true)));

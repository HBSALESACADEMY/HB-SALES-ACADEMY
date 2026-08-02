-- Migration 35: Leads/Termine — der Call Tracker kann beim "Terminiert"-Klick
-- direkt Kundendaten erfassen (Name, Telefon, E-Mail, Unternehmen, Webseite,
-- Entscheider, Notiz, optional eine hochgeladene Aufnahme), statt nur eine
-- Zahl hochzuzählen.
-- Einmalig im Supabase SQL Editor ausführen.

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
  created_at timestamptz not null default now()
);

alter table leads enable row level security;

drop policy if exists "leads_select" on leads;
create policy "leads_select" on leads for select using (
  created_by = auth.uid()
  or exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_platform_admin)
  or (
    exists (select 1 from profiles where profiles.id = auth.uid() and (profiles.role = 'manager' or profiles.is_admin))
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
    exists (select 1 from profiles where profiles.id = auth.uid() and (profiles.role = 'manager' or profiles.is_admin))
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

-- Privater Bucket für hochgeladene Anruf-Aufnahmen — kein öffentlicher
-- Zugriff, nur über signierte URLs (siehe pages/api/lead-recording-url.js
-- für Manager/Admin-Zugriff; Vertriebler:innen greifen direkt über die
-- eigene Ordner-Berechtigung unten zu).
insert into storage.buckets (id, name, public)
values ('lead-recordings', 'lead-recordings', false)
on conflict (id) do nothing;

drop policy if exists "lead_recordings_own_folder_all" on storage.objects;
create policy "lead_recordings_own_folder_all" on storage.objects for all using (
  bucket_id = 'lead-recordings' and (storage.foldername(name))[1] = auth.uid()::text
) with check (
  bucket_id = 'lead-recordings' and (storage.foldername(name))[1] = auth.uid()::text
);

insert into nav_items (key, label, icon, route, is_builtin, requires_manager, order_index)
values ('termine', 'Termine', 'target', '/termine', true, false, 17)
on conflict (key) do nothing;

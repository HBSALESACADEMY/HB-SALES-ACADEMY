-- Migration 33: Personalisierte Lernpfade werden vollständige Kurse statt
-- kleiner Einzelmodule — gleiche Tiefe/Struktur wie die 7 Grundkurse
-- (mehrere Module mit Theorie + Multiple-Choice + offener Frage, plus
-- Abschlussprüfung mit Fallstudie).
-- Einmalig im Supabase SQL Editor ausführen.
--
-- personal_modules (migration_32) wird dadurch ersetzt — die Tabelle wurde
-- gerade erst angelegt und noch nirgends echt genutzt, daher hier direkt
-- verworfen statt als Karteileiche stehen zu lassen. Falls migration_32 bei
-- dir noch nicht gelaufen ist, ist der drop hier einfach ein No-op.

drop table if exists personal_modules cascade;

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

alter table personal_courses enable row level security;

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

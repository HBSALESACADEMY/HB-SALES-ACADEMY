-- Migration 32: Personalisierter Lernpfad nach den 7 Grundkursen.
-- Einmalig im Supabase SQL Editor ausführen.
--
-- Konzept: Die 7 festen Grundkurse (lib/curriculum.js) bleiben für alle
-- gleich. Danach generiert die KI fortlaufend individuelle Zusatzmodule
-- (personal_modules), zugeschnitten auf die Schwächen des jeweiligen
-- Vertrieblers (aus quiz_results erkannt). Admins/Plattform-Admins haben
-- direkten Zugriff auf alle Kurse UND auf die individuellen Module aller
-- Mitarbeiter (siehe pages/admin/lernpfade.js).

create table if not exists personal_modules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  title text not null,
  focus_area text not null,
  theory text not null,
  question text not null,
  source_course_id text,
  source_module_id text,
  completed_at timestamptz,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table personal_modules enable row level security;

drop policy if exists "personal_modules_select" on personal_modules;
create policy "personal_modules_select" on personal_modules for select using (
  user_id = auth.uid()
  or exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_platform_admin)
  or (
    exists (select 1 from profiles where profiles.id = auth.uid() and (profiles.role = 'manager' or profiles.is_admin))
    and same_org(user_id, auth.uid())
  )
);

drop policy if exists "personal_modules_insert" on personal_modules;
create policy "personal_modules_insert" on personal_modules for insert with check (
  user_id = auth.uid()
  or exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_platform_admin)
  or (
    exists (select 1 from profiles where profiles.id = auth.uid() and (profiles.role = 'manager' or profiles.is_admin))
    and same_org(user_id, auth.uid())
  )
);

-- Als erledigt markieren darf nur der/die Vertriebler:in selbst.
drop policy if exists "personal_modules_update_own" on personal_modules;
create policy "personal_modules_update_own" on personal_modules for update using (user_id = auth.uid());

-- Plattform-Admins ohne is_admin=true konnten quiz_results/exam_results
-- anderer Nutzer bisher nicht sehen (die bestehende Admin-Policy prüfte nur
-- is_admin, nicht is_platform_admin) — für die neue Lernpfad-Übersicht
-- (pages/admin/lernpfade.js) nötig, damit Plattform-Admins organisations-
-- übergreifend Schwächen-Daten einsehen können.
drop policy if exists "quiz_results_select_admin" on quiz_results;
create policy "quiz_results_select_admin" on quiz_results for select using (
  exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_platform_admin)
  or (exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_admin = true) and same_org(user_id, auth.uid()))
);
drop policy if exists "exam_results_select_admin" on exam_results;
create policy "exam_results_select_admin" on exam_results for select using (
  exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_platform_admin)
  or (exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_admin = true) and same_org(user_id, auth.uid()))
);

insert into nav_items (key, label, icon, route, is_builtin, requires_manager, order_index)
values ('lernpfad', 'Mein Lernpfad', 'target', '/lernpfad', true, false, 15)
on conflict (key) do nothing;

insert into nav_items (key, label, icon, route, is_builtin, requires_manager, order_index)
values ('admin-lernpfade', 'Lernpfade (Team)', 'award', '/admin/lernpfade', true, true, 16)
on conflict (key) do nothing;

-- Houmans Account so markieren, als hätte er alle 7 Grundkurse bereits
-- abgeschlossen (Test-/Vorschauzustand für den Plattform-Admin-Account).
-- Admins sehen ohnehin immer alle Kurse freigeschaltet (siehe
-- pages/courses/index.js) — das hier sorgt zusätzlich dafür, dass Kurse/
-- Zertifikate-Seite auch inhaltlich "fertig" aussehen (echte Prüfungs- und
-- Modul-Ergebnisse statt nur eines Rechte-Bypasses).
do $$
declare target_id uuid;
begin
  select id into target_id from auth.users where email = 'houman.honarmand@gmx.de';
  if target_id is not null then
    insert into exam_results (user_id, course_id, score, total, passed)
    select target_id, c.course_id, 8, 8, true
    from (values ('grundlagen'), ('beziehung'), ('ueberzeugung'), ('verzerrung'), ('einwand'), ('kaltakquise'), ('bestandskunden')) as c(course_id)
    where not exists (
      select 1 from exam_results er where er.user_id = target_id and er.course_id = c.course_id and er.passed
    );

    insert into quiz_results (user_id, course_id, module_id, mc_score, mc_total, open_score, open_total)
    select target_id, m.course_id, m.module_id, 6, 6, 1, 1
    from (values
      ('grundlagen','g1'), ('grundlagen','g2'), ('grundlagen','g3'),
      ('beziehung','b1'), ('beziehung','b2'), ('beziehung','b3'),
      ('ueberzeugung','u1'), ('ueberzeugung','u2'), ('ueberzeugung','u3'), ('ueberzeugung','u4'),
      ('verzerrung','v1'), ('verzerrung','v2'), ('verzerrung','v3'), ('verzerrung','v4'),
      ('einwand','e1'), ('einwand','e2'), ('einwand','e3'), ('einwand','e4'),
      ('kaltakquise','k1'), ('kaltakquise','k2'), ('kaltakquise','k3'),
      ('bestandskunden','b1'), ('bestandskunden','b2'), ('bestandskunden','b3')
    ) as m(course_id, module_id)
    where not exists (
      select 1 from quiz_results qr where qr.user_id = target_id and qr.course_id = m.course_id and qr.module_id = m.module_id
    );
  end if;
end $$;

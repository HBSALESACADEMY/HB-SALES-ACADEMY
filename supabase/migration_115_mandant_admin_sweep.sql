-- Ein Plattform-Admin sieht nur, was zur AKTIVEN Organisation gehört.
--
-- Gemeldet: mit dem Admin-Konto bei "HB intern" standen Skripte einer
-- anderen Organisation unter Schulungen. Zwei Ursachen, beide hier behoben.
--
-- 1. Der pauschale Zweig "oder ist Plattform-Admin". Er hebt in derselben
--    Regel wieder auf, was der Rest sorgfältig eingrenzt. migration_95 hat
--    ihn für Community, Lernen und Protokolle entfernt — diese Tabellen
--    waren übersehen worden.
--
-- 2. Der Vergleich gegen die HEIMAT-Organisation des Kontos
--    (profiles.organization_id) statt gegen die aktive (aktive_org).
--    Für alle, die nur in einer Organisation arbeiten, ist das dasselbe;
--    für einen Admin per Firmencode ist es der Unterschied zwischen
--    "meine Firma" und "die Firma, in der ich gerade bin" (migration_92).
--
-- Kein Verlust an Handlungsfähigkeit: der Admin darf in der Organisation,
-- in der er gerade unterwegs ist, unverändert alles. Er nimmt nur nichts
-- mehr aus einer anderen mit.

-- --- Skripte -------------------------------------------------------------
-- Wie bei den Terminen (migration_114) gehört die Organisation an den
-- Datensatz: "eigene Einträge sieht man immer" gilt sonst in JEDER
-- Organisation, und die Skripte des Admins wandern überall mit.
alter table scripts add column if not exists organization_id uuid references organizations(id) on delete cascade;

update scripts
   set organization_id = (select p.organization_id from profiles p where p.id = scripts.created_by)
 where organization_id is null;

create index if not exists scripts_org_idx on scripts (organization_id);

drop policy if exists "scripts_select_all" on scripts;
create policy "scripts_select_all" on scripts for select using (
  eintrag_org(organization_id, created_by) is not distinct from aktive_org(auth.uid())
  and (created_by = auth.uid() or visibility = 'org')
);

-- Die Regeln heissen seit migration_91 ohne "_managers"; beide Namen werden
-- entfernt, damit keine alte, weitere ERLAUBENDE Regel danebensteht.
drop policy if exists "scripts_insert" on scripts;
drop policy if exists "scripts_insert_own" on scripts;
drop policy if exists "scripts_insert_managers" on scripts;
create policy "scripts_insert" on scripts for insert with check (
  created_by = auth.uid()
  and (organization_id is null or organization_id is not distinct from aktive_org(auth.uid()))
);

drop policy if exists "scripts_update" on scripts;
drop policy if exists "scripts_update_managers" on scripts;
create policy "scripts_update" on scripts for update
using (
  eintrag_org(organization_id, created_by) is not distinct from aktive_org(auth.uid())
  and (created_by = auth.uid() or darf_skripte_veroeffentlichen(auth.uid()))
)
with check (
  eintrag_org(organization_id, created_by) is not distinct from aktive_org(auth.uid())
  and (created_by = auth.uid() or darf_skripte_veroeffentlichen(auth.uid()))
);

drop policy if exists "scripts_delete" on scripts;
drop policy if exists "scripts_delete_managers" on scripts;
create policy "scripts_delete" on scripts for delete using (
  eintrag_org(organization_id, created_by) is not distinct from aktive_org(auth.uid())
  and (created_by = auth.uid() or darf_skripte_veroeffentlichen(auth.uid()))
);

-- --- Navigationspunkte ---------------------------------------------------
drop policy if exists "nav_items_select_all" on nav_items;
create policy "nav_items_select_all" on nav_items for select using (
  is_builtin = true
  or organization_id is not distinct from aktive_org(auth.uid())
);

drop policy if exists "nav_items_update_managers" on nav_items;
create policy "nav_items_update_managers" on nav_items for update using (
  (exists (select 1 from profiles where profiles.id = auth.uid()
           and (profiles.role in ('manager', 'trainer') or profiles.is_admin or profiles.is_platform_admin)))
  and (is_builtin = true or organization_id is not distinct from aktive_org(auth.uid()))
);

drop policy if exists "nav_items_delete_managers" on nav_items;
create policy "nav_items_delete_managers" on nav_items for delete using (
  (exists (select 1 from profiles where profiles.id = auth.uid()
           and (profiles.role in ('manager', 'trainer') or profiles.is_admin or profiles.is_platform_admin)))
  and (is_builtin = true or organization_id is not distinct from aktive_org(auth.uid()))
);

-- --- Module eigener Kurse ------------------------------------------------
-- Die Organisation steht am Kurs; das Modul erbt sie. Verglichen wird gegen
-- die aktive Organisation, nicht gegen die Heimat des Kontos.
create or replace function public.kurs_org(p_kurs uuid)
returns uuid
language sql stable security definer as $$
  select organization_id from custom_courses where id = p_kurs;
$$;

drop policy if exists "custom_modules_select_all" on custom_modules;
create policy "custom_modules_select_all" on custom_modules for select using (
  kurs_org(course_id) is not distinct from aktive_org(auth.uid())
);

drop policy if exists "custom_modules_update_managers" on custom_modules;
create policy "custom_modules_update_managers" on custom_modules for update using (
  kurs_org(course_id) is not distinct from aktive_org(auth.uid())
  and (ist_fuehrungsrolle(auth.uid())
       or exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'trainer')
       or is_team_lead(auth.uid()))
);

drop policy if exists "custom_modules_delete_managers" on custom_modules;
create policy "custom_modules_delete_managers" on custom_modules for delete using (
  kurs_org(course_id) is not distinct from aktive_org(auth.uid())
  and (ist_fuehrungsrolle(auth.uid())
       or exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'trainer')
       or is_team_lead(auth.uid()))
);

-- --- Eigene Kurse: Ändern und Löschen ------------------------------------
drop policy if exists "custom_courses_update_managers" on custom_courses;
create policy "custom_courses_update_managers" on custom_courses for update using (
  organization_id is not distinct from aktive_org(auth.uid())
  and (ist_fuehrungsrolle(auth.uid())
       or exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'trainer')
       or is_team_lead(auth.uid()))
);

drop policy if exists "custom_courses_delete_managers" on custom_courses;
create policy "custom_courses_delete_managers" on custom_courses for delete using (
  organization_id is not distinct from aktive_org(auth.uid())
  and (ist_fuehrungsrolle(auth.uid())
       or exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'trainer')
       or is_team_lead(auth.uid()))
);

-- --- Kommentare und Aufgaben an Terminen ----------------------------------
-- Sie hängen an der Sichtbarkeit des Termins. Die steht seit migration_114
-- fest — hier bleibt nur, den pauschalen Admin-Zweig zu streichen.
drop policy if exists "lead_comments_select_all" on lead_comments;
create policy "lead_comments_select_all" on lead_comments for select using (
  exists (select 1 from leads l where l.id = lead_comments.lead_id)
);

drop policy if exists "lead_comments_insert_own" on lead_comments;
create policy "lead_comments_insert_own" on lead_comments for insert with check (
  auth.uid() = user_id
  and exists (select 1 from leads l where l.id = lead_comments.lead_id)
);

drop policy if exists "lead_comments_delete_own_or_manager" on lead_comments;
create policy "lead_comments_delete_own_or_manager" on lead_comments for delete using (
  auth.uid() = user_id
  or (ist_fuehrungsrolle(auth.uid())
      and exists (select 1 from leads l where l.id = lead_comments.lead_id))
);

drop policy if exists "lead_tasks_select_all" on lead_tasks;
create policy "lead_tasks_select_all" on lead_tasks for select using (
  ((assigned_to = auth.uid() or assigned_by = auth.uid()) and sieht_person(assigned_to))
  or exists (select 1 from leads l where l.id = lead_tasks.lead_id)
);

drop policy if exists "lead_tasks_update_involved_or_manager" on lead_tasks;
create policy "lead_tasks_update_involved_or_manager" on lead_tasks for update using (
  ((assigned_to = auth.uid() or assigned_by = auth.uid()) and sieht_person(assigned_to))
  or (ist_fuehrungsrolle(auth.uid())
      and exists (select 1 from leads l where l.id = lead_tasks.lead_id))
);

drop policy if exists "lead_tasks_delete_own_or_manager" on lead_tasks;
create policy "lead_tasks_delete_own_or_manager" on lead_tasks for delete using (
  (assigned_by = auth.uid() and sieht_person(assigned_to))
  or (ist_fuehrungsrolle(auth.uid())
      and exists (select 1 from leads l where l.id = lead_tasks.lead_id))
);

-- --- Aufnahmen -------------------------------------------------------------
drop policy if exists "call_recordings_select" on call_recordings;
create policy "call_recordings_select" on call_recordings for select using (
  (created_by = auth.uid() and sieht_person(created_by))
  or (visibility = 'org' and same_org(created_by, auth.uid()))
  or (
    visibility = 'team_lead'
    and (
      is_team_lead_of(created_by, auth.uid())
      or (same_org(created_by, auth.uid()) and ist_fuehrungsrolle(auth.uid()))
    )
  )
);

drop policy if exists "call_recordings_delete" on call_recordings;
create policy "call_recordings_delete" on call_recordings for delete using (
  (created_by = auth.uid() and sieht_person(created_by))
  or (ist_fuehrungsrolle(auth.uid()) and same_org(created_by, auth.uid()))
);

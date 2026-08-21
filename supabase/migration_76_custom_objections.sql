-- Einwand-Trainer, weißes Label, Fortsetzung: Organisationen können jetzt
-- eigene Einwand-Szenarien anlegen (Frage/Antwort Sie+Du, Tipp), zusätzlich
-- zu den festen HB-Standard-Einwänden — siehe pages/admin/objections.js und
-- dem Einwand-Trainer (heute pages/einwand-trainer.js).
create table if not exists custom_objections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  -- Verweist auf denselben Kategorie-Schlüssel wie organizations.objection_categories
  -- (siehe lib/objectionCategories.js) — EIN gemeinsames Kategorie-System für
  -- Call Tracker und Einwand-Trainer statt zwei getrennter.
  cat text not null default 'sonstiges',
  q_pro text not null,
  a_pro text not null,
  q_ent text,
  a_ent text,
  tip text,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table custom_objections enable row level security;

-- Alle Mitglieder der eigenen Organisation dürfen die Einwände SEHEN
-- (brauchen sie ja zum Üben); nur Manager/Admins dürfen sie verwalten.
-- Plattform-Admins sehen/verwalten alles (auch für Firmencode-Ansicht als
-- andere Organisation — die Zielorganisation kommt dann vom Client).
drop policy if exists "custom_objections_select" on custom_objections;
create policy "custom_objections_select" on custom_objections for select using (
  exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_platform_admin)
  or organization_id = (select organization_id from profiles where profiles.id = auth.uid())
);

drop policy if exists "custom_objections_insert" on custom_objections;
create policy "custom_objections_insert" on custom_objections for insert with check (
  exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_platform_admin)
  or (
    exists (select 1 from profiles where profiles.id = auth.uid() and (profiles.role = 'manager' or profiles.is_admin))
    and organization_id = (select organization_id from profiles where profiles.id = auth.uid())
  )
);

drop policy if exists "custom_objections_update" on custom_objections;
create policy "custom_objections_update" on custom_objections for update using (
  exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_platform_admin)
  or (
    exists (select 1 from profiles where profiles.id = auth.uid() and (profiles.role = 'manager' or profiles.is_admin))
    and organization_id = (select organization_id from profiles where profiles.id = auth.uid())
  )
);

drop policy if exists "custom_objections_delete" on custom_objections;
create policy "custom_objections_delete" on custom_objections for delete using (
  exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_platform_admin)
  or (
    exists (select 1 from profiles where profiles.id = auth.uid() and (profiles.role = 'manager' or profiles.is_admin))
    and organization_id = (select organization_id from profiles where profiles.id = auth.uid())
  )
);

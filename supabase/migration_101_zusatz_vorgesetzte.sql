-- Eine Person kann mehreren Vorgesetzten zugeordnet sein.
--
-- profiles.vorgesetzter_id (migration_100) trägt weiterhin die HAUPT-
-- zuordnung — nach ihr wird der Baum gezeichnet, denn ein Kasten kann im
-- Diagramm nur an einer Stelle stehen. Zusätzliche Zuordnungen kommen hier
-- hinein und werden als weitere Linie eingezeichnet.
--
-- Anlass: zwei Personen auf derselben Ebene (etwa zwei Geschäftsführer), die
-- sich dieselben Leute teilen.
create table if not exists org_zusatz_chefs (
  person_id uuid not null references profiles(id) on delete cascade,
  chef_id uuid not null references profiles(id) on delete cascade,
  angelegt_at timestamptz not null default now(),
  primary key (person_id, chef_id),
  constraint org_zusatz_chefs_nicht_selbst check (person_id <> chef_id)
);

alter table org_zusatz_chefs enable row level security;

-- Lesen wie das übrige Organigramm: alle der aktiven Organisation.
drop policy if exists "org_zusatz_chefs_select" on org_zusatz_chefs;
create policy "org_zusatz_chefs_select" on org_zusatz_chefs for select using (sieht_person(person_id));

-- Geschrieben wird ausschliesslich über pages/api/org-supervisor.js mit
-- Rechteprüfung — wie bei der Hauptzuordnung soll niemand für sich selbst
-- festlegen, wem er unterstellt ist. Deshalb bewusst keine Schreibregeln.

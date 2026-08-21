-- Selbst gebaute Organisationsstruktur.
--
-- Das bisherige Organigramm leitet sich vollständig aus den Teams ab: Team B
-- hängt unter A, wenn die Leitung von B Mitglied von A ist. Das bildet ab,
-- was IST — aber nicht, wie die Firma gegliedert sein SOLL. Abteilungen, die
-- noch kein Team haben, kommen darin gar nicht vor.
--
-- Deshalb: frei anlegbare Einheiten in beliebiger Verschachtelung. Teams
-- lassen sich einer Einheit zuordnen und erscheinen dann automatisch dort —
-- entsteht später ein neues Team, hängt man es einmal ein und es ist Teil
-- der Struktur.
create table if not exists org_units (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  parent_id uuid references org_units(id) on delete cascade,
  name text not null,
  order_index integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists org_units_org_idx on org_units (organization_id, parent_id, order_index);

alter table org_units enable row level security;

-- Lesen: alle der aktiven Organisation. Die Struktur ist kein Geheimnis,
-- sie hilft jedem beim Einordnen.
drop policy if exists "org_units_select" on org_units;
create policy "org_units_select" on org_units for select using (
  organization_id is not distinct from aktive_org(auth.uid())
);

-- Ändern: nur Führungsrollen derselben (aktiven) Organisation.
drop policy if exists "org_units_write" on org_units;
create policy "org_units_write" on org_units for all
using (
  organization_id is not distinct from aktive_org(auth.uid())
  and exists (select 1 from profiles where id = auth.uid() and (role = 'manager' or role = 'backend' or is_admin or is_platform_admin))
)
with check (
  organization_id is not distinct from aktive_org(auth.uid())
  and exists (select 1 from profiles where id = auth.uid() and (role = 'manager' or role = 'backend' or is_admin or is_platform_admin))
);

-- Zuordnung eines Teams zu einer Einheit. Wird die Einheit gelöscht, bleibt
-- das Team bestehen und steht wieder unter "Nicht zugeordnet".
alter table teams add column if not exists org_unit_id uuid references org_units(id) on delete set null;

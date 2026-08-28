-- Anwesenheit in eine eigene Tabelle — sie hat in profiles nichts verloren.
--
-- Gemeldet: alle Seiten laden extrem langsam. Ursache: profiles wird per
-- Echtzeit an ALLE offenen Browser gemeldet (supabase_realtime), und seit
-- migration_119 schrieb jede geöffnete Academy dort alle zwei Minuten ihr
-- Lebenszeichen hinein. Jede dieser Schreibungen löste bei jedem
-- angemeldeten Menschen ein Neuladen aus — in der Seitenleiste, auf dem
-- Dashboard, in der Nutzerverwaltung. Bei mehreren Leuten gleichzeitig
-- entstand daraus ein Dauerfeuer.
--
-- Deshalb hier eine eigene, kleine Tabelle, die NICHT in der
-- Echtzeit-Veröffentlichung steckt. Sie wird nur gelesen, wenn jemand die
-- Aktivitäten ansieht.
create table if not exists anwesenheit (
  user_id uuid primary key references profiles(id) on delete cascade,
  organization_id uuid references organizations(id) on delete cascade,
  zuletzt_at timestamptz not null default now()
);

create index if not exists anwesenheit_org_idx on anwesenheit (organization_id, zuletzt_at desc);

alter table anwesenheit enable row level security;

-- Lesen: die eigene Zeile und die der eigenen Organisation. "Wer ist gerade
-- da" ist eine Frage innerhalb eines Teams, nicht darüber hinaus.
drop policy if exists "anwesenheit_select" on anwesenheit;
create policy "anwesenheit_select" on anwesenheit for select using (
  user_id = auth.uid() or sieht_person(user_id)
);

-- Schreiben darf jede Person nur für sich selbst.
drop policy if exists "anwesenheit_insert" on anwesenheit;
create policy "anwesenheit_insert" on anwesenheit for insert with check (user_id = auth.uid());

drop policy if exists "anwesenheit_update" on anwesenheit;
create policy "anwesenheit_update" on anwesenheit for update using (user_id = auth.uid());

-- Die Spalte aus migration_119 bleibt bestehen, wird aber nicht mehr
-- beschrieben. Sie zu löschen wäre unnötig riskant; leer schadet sie nicht.

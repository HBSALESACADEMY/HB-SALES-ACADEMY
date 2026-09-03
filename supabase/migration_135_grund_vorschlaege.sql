-- Ablehnungsgründe, die aus dem Team kommen.
--
-- Die Kategorien legt die Leitung fest — aber am Telefon hört man Dinge, an
-- die dabei niemand gedacht hat. Wer sie unter "Sonstiges" verbucht,
-- verliert genau die Information, die interessant gewesen wäre. Hier landet
-- der eingetippte Freitext; die Leitung sieht die Vorschläge gesammelt und
-- macht daraus bei Bedarf eine richtige Kategorie.
create table if not exists grund_vorschlaege (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  text text not null,
  -- 'offen' wartet auf die Leitung, 'uebernommen' wurde zur Kategorie,
  -- 'abgelehnt' bleibt liegen. Abgelehnte werden nicht gelöscht: sonst
  -- taucht derselbe Vorschlag in der nächsten Woche wieder auf.
  status text not null default 'offen' check (status in ('offen', 'uebernommen', 'abgelehnt')),
  created_at timestamptz not null default now()
);

create index if not exists grund_vorschlaege_org_idx on grund_vorschlaege (organization_id, status);

alter table grund_vorschlaege enable row level security;

-- Eigene Zeilen ohne Zusatzbedingung — die Regel, die schon zweimal Leute
-- aus ihren eigenen Daten ausgesperrt hat.
drop policy if exists "grund_vorschlaege_insert_own" on grund_vorschlaege;
create policy "grund_vorschlaege_insert_own" on grund_vorschlaege for insert
  with check (auth.uid() = user_id);

drop policy if exists "grund_vorschlaege_select_own" on grund_vorschlaege;
create policy "grund_vorschlaege_select_own" on grund_vorschlaege for select
  using (auth.uid() = user_id);

-- Die Leitung sieht und bearbeitet die Vorschläge ihrer Organisation.
drop policy if exists "grund_vorschlaege_select_leitung" on grund_vorschlaege;
create policy "grund_vorschlaege_select_leitung" on grund_vorschlaege for select using (
  ist_fuehrungsrolle(auth.uid()) and sieht_person(user_id)
);

drop policy if exists "grund_vorschlaege_update_leitung" on grund_vorschlaege;
create policy "grund_vorschlaege_update_leitung" on grund_vorschlaege for update using (
  ist_fuehrungsrolle(auth.uid()) and sieht_person(user_id)
);

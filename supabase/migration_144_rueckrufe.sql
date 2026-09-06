-- Die Rückrufliste.
--
-- "Nicht erreicht" wird gezählt und dann vergessen. Dabei ist der Rückruf am
-- Nachmittag der billigste Termin überhaupt: die Nummer ist da, die
-- Recherche gemacht, und niemand muss die Firma neu suchen.
--
-- Bewusst eine eigene Tabelle und kein Feld an den Tageszählern: ein
-- Rückruf ist eine Aufgabe mit Namen und Nummer, keine Zahl.
create table if not exists rueckrufe (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  organization_id uuid references organizations(id) on delete cascade,
  name text,
  telefon text,
  firma text,
  notiz text,
  -- Wann es sich lohnt, es wieder zu versuchen. Ohne Angabe: einfach
  -- später — die Liste ist dann nach Alter sortiert.
  wieder_ab timestamptz,
  erledigt_am timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists rueckrufe_user_idx on rueckrufe (user_id, erledigt_am, created_at desc);

alter table rueckrufe enable row level security;

-- Eigene Zeilen ohne jede Zusatzbedingung — die Regel, die schon dreimal
-- Leute aus ihren eigenen Daten ausgesperrt hat.
drop policy if exists "rueckrufe_select_own" on rueckrufe;
create policy "rueckrufe_select_own" on rueckrufe for select using (auth.uid() = user_id);
drop policy if exists "rueckrufe_insert_own" on rueckrufe;
create policy "rueckrufe_insert_own" on rueckrufe for insert with check (auth.uid() = user_id);
drop policy if exists "rueckrufe_update_own" on rueckrufe;
create policy "rueckrufe_update_own" on rueckrufe for update using (auth.uid() = user_id);
drop policy if exists "rueckrufe_delete_own" on rueckrufe;
create policy "rueckrufe_delete_own" on rueckrufe for delete using (auth.uid() = user_id);

-- Führung sieht die Liste ihrer Leute: dass jemand zwanzig offene Rückrufe
-- vor sich herschiebt, ist eine Führungsfrage.
drop policy if exists "rueckrufe_select_leitung" on rueckrufe;
create policy "rueckrufe_select_leitung" on rueckrufe for select using (
  ist_fuehrungsrolle(auth.uid()) and sieht_person(user_id)
);

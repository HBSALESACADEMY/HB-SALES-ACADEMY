-- Cold Call Bingo: eine Karte je Person, 25 Felder, gegenseitig befüllt.
--
-- Zwei Tabellen statt einer: die Karte trägt den Zustand des Spiels (wann
-- begonnen, wann das erste Bingo), die Felder tragen Wort, Zusteller und
-- Haken. So lässt sich ein Feld einzeln abhaken, ohne die ganze Karte neu
-- zu schreiben — und zwei Leute, die gleichzeitig ein Wort zustecken,
-- überschreiben sich nicht gegenseitig.
create table if not exists bingo_karten (
  id uuid primary key default gen_random_uuid(),
  besitzer_id uuid not null references profiles(id) on delete cascade,
  -- Ausdrücklich statt aus dem Konto abgeleitet (siehe migration_53/114).
  organization_id uuid references organizations(id) on delete cascade,
  bingo_at timestamptz,
  created_at timestamptz not null default now(),
  -- Eine aktive Karte je Person: mehrere gleichzeitig wären beim Zustecken
  -- nicht unterscheidbar ("auf welche denn?").
  unique (besitzer_id)
);

create table if not exists bingo_felder (
  id uuid primary key default gen_random_uuid(),
  karte_id uuid not null references bingo_karten(id) on delete cascade,
  position smallint not null check (position >= 0 and position < 25),
  wort text not null,
  -- Wer das Wort zugesteckt hat. Leer bei zufällig aufgefüllten Feldern —
  -- dafür gibt es dann auch keine Punkte.
  von_id uuid references profiles(id) on delete set null,
  abgehakt boolean not null default false,
  abgehakt_at timestamptz,
  created_at timestamptz not null default now(),
  unique (karte_id, position)
);

create index if not exists bingo_felder_karte_idx on bingo_felder (karte_id);

alter table bingo_karten enable row level security;
alter table bingo_felder enable row level security;

-- Lesen: die eigene Karte, und die Karten der eigenen Organisation — man
-- muss sehen können, wem man gerade ein Wort zusteckt.
drop policy if exists "bingo_karten_select" on bingo_karten;
create policy "bingo_karten_select" on bingo_karten for select using (
  besitzer_id = auth.uid() or sieht_person(besitzer_id)
);

drop policy if exists "bingo_karten_insert" on bingo_karten;
create policy "bingo_karten_insert" on bingo_karten for insert with check (
  besitzer_id = auth.uid()
  and (organization_id is null or organization_id is not distinct from aktive_org(auth.uid()))
);

-- Ändern darf nur, wem die Karte gehört (Bingo-Zeitpunkt, Neustart).
drop policy if exists "bingo_karten_update" on bingo_karten;
create policy "bingo_karten_update" on bingo_karten for update using (besitzer_id = auth.uid());

drop policy if exists "bingo_karten_delete" on bingo_karten;
create policy "bingo_karten_delete" on bingo_karten for delete using (besitzer_id = auth.uid());

-- Felder: sichtbar wie die Karte.
drop policy if exists "bingo_felder_select" on bingo_felder;
create policy "bingo_felder_select" on bingo_felder for select using (
  exists (select 1 from bingo_karten k where k.id = bingo_felder.karte_id)
);

-- Zustecken darf jede Person der eigenen Organisation — das ist der Sinn des
-- Spiels. Nur in eigenem Namen, damit niemand ein Wort unter fremdem Namen
-- unterschiebt.
drop policy if exists "bingo_felder_insert" on bingo_felder;
create policy "bingo_felder_insert" on bingo_felder for insert with check (
  exists (
    select 1 from bingo_karten k
    where k.id = bingo_felder.karte_id
      and (k.besitzer_id = auth.uid() or sieht_person(k.besitzer_id))
  )
  and (von_id is null or von_id = auth.uid())
);

-- Abhaken darf nur, wem die Karte gehört.
drop policy if exists "bingo_felder_update" on bingo_felder;
create policy "bingo_felder_update" on bingo_felder for update using (
  exists (select 1 from bingo_karten k where k.id = bingo_felder.karte_id and k.besitzer_id = auth.uid())
);

drop policy if exists "bingo_felder_delete" on bingo_felder;
create policy "bingo_felder_delete" on bingo_felder for delete using (
  exists (select 1 from bingo_karten k where k.id = bingo_felder.karte_id and k.besitzer_id = auth.uid())
);

-- Navigationspunkt unter "Üben" (wie migration_111 für den Kalender).
insert into nav_items (key, label, icon, route, is_builtin, requires_manager, visible, order_index)
values ('bingo', 'Cold Call Bingo', 'target', '/bingo', true, false, true,
        coalesce((select order_index from nav_items where key = 'duel'), 60) + 1)
on conflict (key) do update
  set label = excluded.label, icon = excluded.icon, route = excluded.route,
      visible = true, requires_manager = false;

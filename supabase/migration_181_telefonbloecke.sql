-- Telefonblöcke aufbewahren.
--
-- Der Block war bisher ein Selbstgespräch: Uhr läuft, Ergebnis erscheint,
-- Ergebnis verschwindet. Nur der persönliche Bestwert blieb — und der lag
-- im Browser, also auf genau einem Gerät.
--
-- Damit fehlt die Antwort auf die Frage, die der Block überhaupt stellt:
-- Wie viele Anwahlen schaffe ich in einer konzentrierten Runde, und wird
-- das über die Wochen besser? Eine Tagessumme von 80 Anwahlen sagt das
-- nicht. Zwei Runden à 25 Minuten mit 18 und 22 Anwahlen sagen es.
--
-- Bewusst eine eigene Tabelle und KEINE Ergänzung von call_log_days: Ein
-- Block ist ein Zeitraum mit Anfang und Ende, kein Tageswert. Und bewusst
-- ohne Verweis auf einzelne Anrufe — gezählt wird weiter die Differenz des
-- Tageszählers, damit es keine zweite Wahrheit über die Anwahlen gibt.

create table if not exists telefon_bloecke (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  -- Die Organisation, in der gearbeitet wurde — nicht die Heimat des
  -- Kontos (vgl. migration_114, migration_128).
  organization_id uuid references organizations(id) on delete cascade,

  gestartet_at timestamptz not null,
  beendet_at timestamptz not null default now(),
  -- Was sich die Person vorgenommen hatte, und was tatsächlich lief. Beides,
  -- weil der Unterschied die interessante Information ist: Wer 25 Minuten
  -- wählt und nach 6 aufhört, arbeitet anders als wer auf 40 verlängert.
  ziel_minuten integer not null check (ziel_minuten > 0 and ziel_minuten <= 180),
  minuten integer not null check (minuten > 0 and minuten <= 600),
  anwahlen integer not null default 0 check (anwahlen >= 0),
  ziel_erreicht boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists telefon_bloecke_user_zeit on telefon_bloecke (user_id, gestartet_at desc);
create index if not exists telefon_bloecke_org_zeit on telefon_bloecke (organization_id, gestartet_at desc);

alter table telefon_bloecke enable row level security;

-- Eigene Zeilen ohne jede Zusatzbedingung. Das ist die Regel, die in dieser
-- Academy schon mehrfach gebrochen wurde und jedes Mal Leute aus ihren
-- eigenen Daten ausgesperrt hat: ein Zweig mit "= auth.uid()" trägt NIE
-- zusätzlich eine Organisationsbedingung.
drop policy if exists "telefon_bloecke_select_own" on telefon_bloecke;
create policy "telefon_bloecke_select_own" on telefon_bloecke for select using (auth.uid() = user_id);

drop policy if exists "telefon_bloecke_insert_own" on telefon_bloecke;
create policy "telefon_bloecke_insert_own" on telefon_bloecke for insert with check (auth.uid() = user_id);

-- Löschen darf man die eigenen: Ein Block, den man vergessen hat zu
-- beenden, soll die eigene Auswertung nicht für immer verzerren.
drop policy if exists "telefon_bloecke_delete_own" on telefon_bloecke;
create policy "telefon_bloecke_delete_own" on telefon_bloecke for delete using (auth.uid() = user_id);

-- Führung sieht ihre Organisation, Teamleitung ihr Team — dieselbe Regel
-- wie bei den Tagessummen (migration_103) und den Anruf-Ereignissen.
drop policy if exists "telefon_bloecke_select_managers" on telefon_bloecke;
create policy "telefon_bloecke_select_managers" on telefon_bloecke for select using (
  sieht_person(user_id)
  and (is_team_lead_of(user_id, auth.uid()) or ist_fuehrungsrolle(auth.uid()))
);

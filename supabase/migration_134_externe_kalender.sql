-- Den eigenen Kalender in die Academy holen.
--
-- Bewusst über eine iCal-Adresse und NICHT über eine Google- oder
-- Microsoft-Anmeldung. Drei Gründe, die zusammen den Ausschlag geben:
-- Google verlangt für Kalenderzugriff ein eigenes Verifizierungsverfahren
-- mit jährlichen Nachweisen; private Termine lägen dauerhaft mit
-- Zugangs-Token in unserer Datenbank; und es wären zwei Anbieter mit zwei
-- Anmeldeflüssen und ablaufenden Token zu pflegen. Die iCal-Adresse
-- funktioniert bei jedem Anbieter, ohne Antrag und ohne fremdes Konto.
--
-- Die Adresse ist ein GEHEIMNIS (Google nennt sie selbst "geheime Adresse"):
-- wer sie hat, liest den Kalender. Deshalb ist sie ausschliesslich für die
-- eigene Person lesbar — auch Führungskräfte bekommen sie nie zu sehen,
-- sondern nur die Termine, die daraus entstehen.
create table if not exists externe_kalender (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  organization_id uuid references organizations(id) on delete cascade,
  name text not null default 'Mein Kalender',
  url text not null,
  -- 'titel' zeigt, WAS ansteht. 'belegt' zeigt nur, DASS jemand keine Zeit
  -- hat. Das ist die Voreinstellung: dass ein Arzttermin im Firmenkalender
  -- steht, will niemand aus Versehen.
  sichtbarkeit text not null default 'belegt' check (sichtbarkeit in ('titel', 'belegt')),
  aktiv boolean not null default true,
  letzter_abruf timestamptz,
  letzter_fehler text,
  created_at timestamptz not null default now()
);

create index if not exists externe_kalender_user_idx on externe_kalender (user_id);

alter table externe_kalender enable row level security;

-- Eigene Zeilen ohne jede Zusatzbedingung — die Regel, die schon zweimal
-- Leute aus ihren eigenen Daten ausgesperrt hat.
drop policy if exists "externe_kalender_own" on externe_kalender;
create policy "externe_kalender_own" on externe_kalender for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Die abgerufenen Termine. Getrennt von der Quelle, weil hier andere
-- mitlesen dürfen — je nach Sichtbarkeit mit oder ohne Titel.
create table if not exists externe_termine (
  id uuid primary key default gen_random_uuid(),
  kalender_id uuid not null references externe_kalender(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  uid text not null,
  titel text,
  beginn timestamptz not null,
  ende timestamptz not null,
  ganztags boolean not null default false,
  unique (kalender_id, uid)
);

create index if not exists externe_termine_user_zeit on externe_termine (user_id, beginn);

alter table externe_termine enable row level security;

drop policy if exists "externe_termine_own" on externe_termine;
create policy "externe_termine_own" on externe_termine for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Führung und Teamleitung sehen die Termine ihrer Leute — dieselbe Grenze
-- wie bei den Anruf-Zahlen. Ob der TITEL dabei sichtbar ist, entscheidet die
-- Sichtbarkeit der Quelle, und das entscheidet der Server beim Ausliefern
-- (pages/api/org-kalender.js): eine Regel kann keine Spalte ausblenden.
drop policy if exists "externe_termine_fuehrung" on externe_termine;
create policy "externe_termine_fuehrung" on externe_termine for select using (
  sieht_person(user_id)
  and (is_team_lead_of(user_id, auth.uid()) or ist_fuehrungsrolle(auth.uid()))
);

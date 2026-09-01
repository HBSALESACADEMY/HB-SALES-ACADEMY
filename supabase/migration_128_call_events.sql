-- Einzelne Anruf-Ereignisse mit Zeitpunkt.
--
-- Bisher speichert der Call Tracker nur Tagessummen ("heute 12x kein
-- Interesse"). Die Frage "welcher Einwand kommt zu welcher Uhrzeit" lässt
-- sich daraus nicht beantworten und auch nicht nachträglich rekonstruieren.
-- Diese Tabelle liegt NEBEN den Tagessummen, sie ersetzt sie nicht: alle
-- bestehenden Zahlen kommen weiterhin aus call_log_days. Damit kann nichts
-- auseinanderlaufen, was heute stimmt.
--
-- Erfasst werden negative Anrufe mit ihrem Grund und die Termine. Die
-- Termine ausdrücklich mit, weil die Gegenfrage zu "wann kommen die
-- Absagen" immer "wann klappt es" lautet.
create table if not exists call_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  -- Die Organisation, in der gearbeitet wurde — nicht die Heimat des
  -- Kontos. Wer per Firmencode in mehreren Organisationen telefoniert,
  -- nähme seine Ereignisse sonst überallhin mit (vgl. migration_114).
  organization_id uuid references organizations(id) on delete cascade,
  art text not null check (art in ('negativ', 'termin')),
  grund text,
  erfasst_at timestamptz not null default now()
);

create index if not exists call_events_user_zeit on call_events (user_id, erfasst_at);
create index if not exists call_events_org_zeit on call_events (organization_id, erfasst_at);

alter table call_events enable row level security;

-- Eigene Zeilen ohne jede Zusatzbedingung.
--
-- Das ist die Regel, die hier zweimal gebrochen wurde und beide Male Leute
-- aus ihren eigenen Daten ausgesperrt hat (Duelle, Aufnahmen): ein Zweig
-- mit "= auth.uid()" darf NIE zusätzlich eine Organisationsbedingung
-- tragen. Sonst sieht ein Plattform-Admin unter fremdem Firmencode seine
-- eigenen Einträge nicht mehr.
drop policy if exists "call_events_select_own" on call_events;
create policy "call_events_select_own" on call_events for select using (auth.uid() = user_id);

drop policy if exists "call_events_insert_own" on call_events;
create policy "call_events_insert_own" on call_events for insert with check (auth.uid() = user_id);

-- Löschen darf man nur die eigenen — nötig für den Minus-Knopf: wer einen
-- negativen Anruf zurücknimmt, nimmt auch dessen Ereignis zurück.
drop policy if exists "call_events_delete_own" on call_events;
create policy "call_events_delete_own" on call_events for delete using (auth.uid() = user_id);

-- Führung sieht ihre Organisation, Teamleitung ihr Team — dieselbe Regel
-- wie bei den Tagessummen (migration_103).
drop policy if exists "call_events_select_managers" on call_events;
create policy "call_events_select_managers" on call_events for select using (
  sieht_person(user_id)
  and (is_team_lead_of(user_id, auth.uid()) or ist_fuehrungsrolle(auth.uid()))
);

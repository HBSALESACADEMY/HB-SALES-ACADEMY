-- ===================================================================
-- ALLE OFFENEN MIGRATIONEN (122 bis 136) — in einem Durchlauf
-- ===================================================================
--
-- Zusammengefasst, weil vierzehn einzelne Durchläufe vierzehn Gelegenheiten
-- sind, einen zu vergessen. Die Reihenfolge ist die richtige und darf nicht
-- geändert werden: spätere Migrationen bauen auf früheren auf.
--
-- Mehrfaches Ausführen ist unschädlich. Jede Anweisung darin nimmt einen
-- bereits vorhandenen Zustand hin ("create table if not exists", "add column
-- if not exists", vor jedem "create policy" ein "drop policy if exists").
-- Wer einzelne davon schon eingespielt hat, kann diese Datei trotzdem
-- komplett laufen lassen.
--
-- Im Supabase-Studio: SQL Editor öffnen, alles hier einfügen, ausführen.
-- ===================================================================


-- ===================================================================
-- migration_122_bingo.sql
-- ===================================================================
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

-- ===================================================================
-- migration_123_buchungslink.sql
-- ===================================================================
-- Buchungslink für den Call Tracker (z. B. cal.com).
--
-- Beim Terminieren steht bisher nur eine Anleitung ("Buchungslink im eigenen
-- System öffnen"). Das Wichtigste — der Link selbst — musste woanders
-- gesucht werden, mitten im Gespräch. Jetzt liegt er hinterlegt und steht
-- als Knopf da, bevor das Formular kommt.
--
-- Zwei Ebenen, weil beides vorkommt: die Organisation hinterlegt einen
-- gemeinsamen Kalender, einzelne Vertriebler haben oft ihren eigenen. Der
-- persönliche gewinnt, sonst gilt der der Organisation.
alter table organizations add column if not exists booking_url text;
alter table profiles add column if not exists booking_url text;

-- ===================================================================
-- migration_124_anwesenheit.sql
-- ===================================================================
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

-- ===================================================================
-- migration_125_ziel_kennzahlen_gatekeeper.sql
-- ===================================================================
-- Ziele auch auf Gatekeeper, Entscheider und Durchstellen.
--
-- Der Assistent im Call Tracker fragt seit kurzem, wen man erreicht hat und
-- ob durchgestellt wurde. Genau daran misst sich Kaltakquise — aber ein Ziel
-- liess sich darauf nicht setzen: die Datenbank kannte diese Kennzahlen
-- nicht, und die Regel hätte jedes solche Ziel abgelehnt.
--
-- Fortsetzung von migration_99, dieselbe Stelle, drei Werte mehr.
alter table team_goals drop constraint if exists team_goals_metric_check;
alter table team_goals add constraint team_goals_metric_check check (metric in (
  'roleplay', 'quiz', 'daily_challenge',
  'anwahlen', 'erreicht', 'nicht', 'termin', 'negativ',
  'gatekeeper', 'entscheider', 'weitergeleitet',
  'termine', 'kunden', 'absagen', 'wahrgenommen'
));

alter table organizations drop constraint if exists organizations_team_ranking_metric_check;
alter table organizations add constraint organizations_team_ranking_metric_check check (
  team_ranking_metric is null or team_ranking_metric in (
    'xp',
    'roleplay', 'quiz', 'daily_challenge',
    'anwahlen', 'erreicht', 'nicht', 'termin', 'negativ',
    'gatekeeper', 'entscheider', 'weitergeleitet',
    'termine', 'kunden', 'absagen', 'wahrgenommen'
  )
);

-- Navigationspunkt für die Ziel-Auswertung.
insert into nav_items (key, label, icon, route, is_builtin, requires_manager, visible, order_index)
values ('ziele', 'Ziele', 'target', '/ziele', true, false, true,
        coalesce((select order_index from nav_items where key = 'team'), 40) + 1)
on conflict (key) do update
  set label = excluded.label, icon = excluded.icon, route = excluded.route,
      visible = true, requires_manager = false;

-- ===================================================================
-- migration_126_eigene_zeilen.sql
-- ===================================================================
-- Was mir gehört, sehe ich immer — Rückbau eines Fehlers aus migration_115.
--
-- Gemeldet: Aufnahmen lassen sich nicht mehr hochladen. Ursache: Ich hatte
-- beim Aufräumen an den EIGENEN Zweig der Leseregel ein sieht_person()
-- gehängt. Das prüft "gehört diese Person zu der Organisation, in der ich
-- gerade bin" — für ein normales Konto immer wahr, für einen Plattform-Admin
-- per Firmencode aber falsch: seine Heimat ist eine andere.
--
-- Folge: Er durfte seine eigenen Aufnahmen nicht mehr lesen. Und weil die
-- Anwendung direkt nach dem Speichern die neue Zeile zurückliest, sah das
-- aus wie ein fehlgeschlagener Upload — obwohl die Datei längst im Speicher
-- lag.
--
-- Richtig ist: eigene Zeilen ohne Bedingung. Die Mandanten-Grenze gilt für
-- FREMDE Zeilen, nicht für die eigenen — sonst sperrt man Leute aus ihren
-- eigenen Daten aus.
drop policy if exists "call_recordings_select" on call_recordings;
create policy "call_recordings_select" on call_recordings for select using (
  created_by = auth.uid()
  or (visibility = 'org' and same_org(created_by, auth.uid()))
  or (
    visibility = 'team_lead'
    and (
      is_team_lead_of(created_by, auth.uid())
      or (same_org(created_by, auth.uid()) and ist_fuehrungsrolle(auth.uid()))
    )
  )
);

drop policy if exists "call_recordings_delete" on call_recordings;
create policy "call_recordings_delete" on call_recordings for delete using (
  created_by = auth.uid()
  or (ist_fuehrungsrolle(auth.uid()) and same_org(created_by, auth.uid()))
);

-- Dieselbe Falle bei den Aufgaben an Terminen: wer eine Aufgabe zugewiesen
-- bekommen oder vergeben hat, muss sie sehen können.
drop policy if exists "lead_tasks_select_all" on lead_tasks;
create policy "lead_tasks_select_all" on lead_tasks for select using (
  assigned_to = auth.uid()
  or assigned_by = auth.uid()
  or exists (select 1 from leads l where l.id = lead_tasks.lead_id)
);

drop policy if exists "lead_tasks_update_involved_or_manager" on lead_tasks;
create policy "lead_tasks_update_involved_or_manager" on lead_tasks for update using (
  assigned_to = auth.uid()
  or assigned_by = auth.uid()
  or (ist_fuehrungsrolle(auth.uid())
      and exists (select 1 from leads l where l.id = lead_tasks.lead_id))
);

drop policy if exists "lead_tasks_delete_own_or_manager" on lead_tasks;
create policy "lead_tasks_delete_own_or_manager" on lead_tasks for delete using (
  assigned_by = auth.uid()
  or (ist_fuehrungsrolle(auth.uid())
      and exists (select 1 from leads l where l.id = lead_tasks.lead_id))
);

-- ===================================================================
-- migration_127_auswertung.sql
-- ===================================================================
-- Navigationspunkt für die Management-Auswertung.
--
-- requires_manager = true: die Seite stellt Menschen nebeneinander und
-- benennt, wer zurückliegt. Sie gehört Teamleitungen und der
-- Vertriebsleitung. Das Ausblenden im Menü ist dabei nur die Höflichkeit —
-- geschützt wird die Auswertung auf dem Server (pages/api/auswertung.js),
-- der die Rolle prüft, bevor er überhaupt etwas liest.
insert into nav_items (key, label, icon, route, is_builtin, requires_manager, visible, order_index)
values ('auswertung', 'Auswertung', 'chart', '/auswertung', true, true, true,
        coalesce((select order_index from nav_items where key = 'manager'), 60) - 1)
on conflict (key) do update
  set label = excluded.label, icon = excluded.icon, route = excluded.route,
      visible = true, requires_manager = true;

-- ===================================================================
-- migration_128_call_events.sql
-- ===================================================================
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

-- ===================================================================
-- migration_129_korrektur_vorrang.sql
-- ===================================================================
-- Wann ein Tag zuletzt von Hand korrigiert wurde.
--
-- Hintergrund: Damit zwei Geräte sich nicht gegenseitig löschen, gilt beim
-- Abgleich der HÖHERE Wert je Zähler. Das ist richtig, solange nur gezählt
-- wird — ein Zähler wächst schliesslich nur.
--
-- Bei einer Korrektur ist es genau falsch. Wer eine zu hohe Zahl herunter-
-- setzt, bekam sie vom nächsten Gerät, auf dem noch der alte Stand lag,
-- sofort wieder hochgezogen. Die Korrektur musste an jedem Gerät einzeln
-- wiederholt werden, und bis dahin sahen alle anderen den falschen Wert.
--
-- Mit diesem Zeitstempel hat die jüngere Korrektur Vorrang vor dem Maximum:
-- ein Gerät, dessen Stand ÄLTER ist als die letzte Korrektur, übernimmt sie,
-- statt sie zu überschreiben.
alter table call_log_days add column if not exists korrigiert_at timestamptz;

comment on column call_log_days.korrigiert_at is
  'Zeitpunkt der letzten Korrektur von Hand. Ein Gerät mit älterem Stand übernimmt die Serverzahlen, statt das Maximum zu bilden.';

-- ===================================================================
-- migration_130_folgetermin.sql
-- ===================================================================
-- Folgetermine für Termine anderer Personen anlegen dürfen.
--
-- Der Fehler: "new row violates row-level security policy for table leads".
--
-- Ein Folgetermin behält bewusst die ursprüngliche Person als created_by —
-- der Termin gehört weiter dem Vertriebler, sonst stünde plötzlich die
-- Führungskraft in dessen Statistik und der Termin fehlte in seiner. Die
-- Insert-Regel verlangte aber "created_by = auth.uid()". Legt also eine
-- Führungskraft einen Folgetermin zum Gespräch einer Vertriebsperson an,
-- lehnt die Datenbank die Zeile ab.
--
-- Neu darf man eine Zeile auch für jemand anderen anlegen — aber nur, wenn
-- man diese Person ohnehin führt und sie in der aktiven Organisation ist.
-- Das ist dieselbe Grenze, die beim Ändern eines Termins schon gilt
-- (leads_update): wer einen fremden Termin bearbeiten darf, darf auch
-- dessen Folgetermin anlegen.
drop policy if exists "leads_insert" on leads;
create policy "leads_insert" on leads for insert with check (
  -- Die Mandanten-Grenze steht wie überall VOR allen anderen Gründen.
  (organization_id is null or organization_id is not distinct from aktive_org(auth.uid()))
  and (
    created_by = auth.uid()
    or (
      sieht_person(created_by)
      and (ist_fuehrungsrolle(auth.uid()) or is_team_lead_of(created_by, auth.uid()))
    )
  )
);

-- ===================================================================
-- migration_131_kalender_abo.sql
-- ===================================================================
-- Persönlicher Schlüssel für das Kalender-Abo.
--
-- Ein Abo-Kalender wird von Apple, Google oder Outlook im Hintergrund
-- abgerufen — ohne Anmeldung, ohne Sitzung, ohne Cookie. Die einzige Form
-- von Ausweis, die dabei funktioniert, ist ein Geheimnis in der Adresse.
--
-- Deshalb ein eigener, zufälliger Schlüssel je Person und ausdrücklich NICHT
-- die Nutzer-Kennung: die steht an vielen Stellen und wäre nicht geheim.
-- Wer den Schlüssel weitergibt, gibt seine Termine weiter — darum lässt er
-- sich jederzeit neu erzeugen, und der alte ist damit sofort wertlos.
--
-- Der Schlüssel erlaubt ausschliesslich Lesen, und nur die Termine dieser
-- einen Person (siehe pages/api/kalender-abo.js).
alter table profiles add column if not exists kalender_token uuid;

create unique index if not exists profiles_kalender_token_idx
  on profiles (kalender_token) where kalender_token is not null;

comment on column profiles.kalender_token is
  'Geheimnis für das Kalender-Abo (nur Lesen, nur eigene Termine). Neu erzeugen macht den alten Link wertlos.';

-- ===================================================================
-- migration_132_kalender_umfang.sql
-- ===================================================================
-- Was im Kalender-Abo landet: nur die eigenen Termine oder die des Teams.
--
-- Der Umfang gehört an die Person und NICHT in die Adresse des Links: stünde
-- er dort, hinge jeder nur "&umfang=team" an und bekäme, was ihm nicht
-- zusteht. So bleibt die Entscheidung in der Datenbank, und die Route prüft
-- bei JEDEM Abruf, ob die Rolle das noch hergibt — wer die Teamleitung
-- abgibt, verliert damit auch den erweiterten Kalender, ohne dass jemand
-- daran denken muss.
alter table profiles add column if not exists kalender_umfang text not null default 'eigene';

alter table profiles drop constraint if exists profiles_kalender_umfang_check;
alter table profiles add constraint profiles_kalender_umfang_check
  check (kalender_umfang in ('eigene', 'team'));

comment on column profiles.kalender_umfang is
  'Umfang des Kalender-Abos: eigene Termine oder zusätzlich die der geführten Personen. Die Berechtigung wird bei jedem Abruf neu geprüft.';

-- ===================================================================
-- migration_133_kalender_auswahl.sql
-- ===================================================================
-- Wessen Termine im Kalender-Abo landen — jetzt auswählbar.
--
-- "Alles oder nichts" reicht nicht: eine Teamleitung will oft die Termine
-- von drei Leuten sehen und nicht die von dreissig. Deshalb drei Zustände:
--
--   eigene   — nur die eigenen Termine (Voreinstellung)
--   team     — alle, die man führt, und zwar auch die, die morgen dazukommen
--   auswahl  — genau die Personen in kalender_personen
--
-- "team" bleibt bewusst neben "auswahl" bestehen: wer sein ganzes Team im
-- Kalender haben will, möchte nicht bei jeder Neueinstellung daran denken,
-- die Liste nachzuziehen.
--
-- kalender_personen ist ein FILTER, keine Berechtigung. Wer dort steht,
-- landet nur dann im Kalender, wenn die Rolle das beim Abruf auch hergibt —
-- sonst würde eine alte Auswahl nach einem Rollenwechsel weiterlaufen.
alter table profiles drop constraint if exists profiles_kalender_umfang_check;
alter table profiles add constraint profiles_kalender_umfang_check
  check (kalender_umfang in ('eigene', 'team', 'auswahl'));

alter table profiles add column if not exists kalender_personen uuid[] not null default '{}';

comment on column profiles.kalender_personen is
  'Bei kalender_umfang = auswahl: wessen Termine mit ins Abo gehen. Nur ein Filter — die Berechtigung wird bei jedem Abruf neu geprüft.';

-- ===================================================================
-- migration_134_externe_kalender.sql
-- ===================================================================
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

-- ===================================================================
-- migration_135_grund_vorschlaege.sql
-- ===================================================================
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

-- ===================================================================
-- migration_136_auswertung_nav_weg.sql
-- ===================================================================
-- Den Menüpunkt "Auswertung" wieder entfernen (Gegenstück zu migration_127).
--
-- Die Führungsauswertung liegt im Verwaltungsbereich unter Auswertung →
-- Vertrieb. Ein zweiter Weg über die Sidebar wäre derselbe Ort an zwei
-- Stellen — und in der Navigationsverwaltung stand damit ein Punkt, den man
-- sortieren und umbenennen konnte, ohne dass es irgendetwas bewirkte.
--
-- Die Seite selbst bleibt unter /auswertung erreichbar; entfernt wird nur
-- der Eintrag im Menü.
delete from nav_items where key = 'auswertung';

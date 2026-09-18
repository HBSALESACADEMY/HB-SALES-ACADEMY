-- Der Vertriebsbuddy: Wochenimpuls per Telegram und ein echtes Gespräch daraus.
--
-- Freitagmorgen bekommt jede verbundene Person ihre Zahlen der Woche, eine
-- Einordnung und genau eine Frage. Antwortet sie im Chat, holt die Academy
-- die Nachricht ab und antwortet — mit den Zahlen und dem bisherigen
-- Gespräch im Hinterkopf.
--
-- Geschrieben wird ausschliesslich vom Server (pages/api/buddy.js,
-- lib/buddy.js). Lesen darf jede Person nur ihr eigenes Gespräch: Was
-- jemand dem Buddy über eine schwere Woche schreibt, geht niemanden sonst
-- etwas an — auch die Leitung nicht.

create table if not exists buddy_nachrichten (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  organization_id uuid references organizations(id) on delete set null,
  -- 'bot' = von der Academy, 'person' = aus Telegram.
  richtung text not null check (richtung in ('bot', 'person')),
  text text not null,
  -- Die Kennung der Telegram-Meldung. Damit kommt dieselbe eingehende
  -- Nachricht nicht zweimal an: getUpdates gibt bis zu 24 Stunden lang
  -- immer wieder dasselbe heraus.
  update_id bigint unique,
  -- Zu welcher Woche das Gespräch gehört (Montag).
  woche date,
  created_at timestamptz not null default now()
);
create index if not exists buddy_nachrichten_person_idx on buddy_nachrichten (user_id, created_at desc);

alter table buddy_nachrichten enable row level security;

drop policy if exists "buddy_nachrichten_eigene" on buddy_nachrichten;
create policy "buddy_nachrichten_eigene" on buddy_nachrichten
  for select using (user_id = auth.uid());

-- Ein- und ausschalten, und für welche Woche der Impuls schon raus ist.
alter table telegram_verknuepfungen add column if not exists buddy boolean not null default true;
alter table telegram_verknuepfungen add column if not exists impuls_fuer date;

-- Wann zuletzt nach neuen Antworten gesehen wurde.
--
-- Eine einzige Zeile: Telegram gibt alle Meldungen aller Chats auf einmal
-- heraus, also fragt die Academy für alle gemeinsam. Ohne diesen Zeitpunkt
-- würde jeder Seitenaufruf eine neue Abfrage auslösen.
create table if not exists buddy_abholung (
  id boolean primary key default true check (id),
  zuletzt timestamptz not null default now()
);
insert into buddy_abholung (id) values (true) on conflict (id) do nothing;

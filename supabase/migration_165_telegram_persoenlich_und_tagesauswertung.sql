-- Persönliche Telegram-Nachrichten und die tägliche Auswertung.
--
-- WICHTIG: migration_164 VORHER ausführen. 164 trägt bei alten Kontakten
-- "kunde" nach; läuft sie danach, hielte der Trigger unten diese alten
-- Kunden für heute gewonnen, und die Auswertung lobte Abschlüsse, die
-- Wochen zurückliegen.
--
-- 1) telegram_verknuepfungen
--
-- Ein Bot kann niemandem von sich aus schreiben. Er darf es erst, wenn die
-- Person ihn gestartet hat — und genau dabei schickt sie den Code mit, den
-- die Academy ihr gegeben hat. So wird aus "irgendein Telegram-Chat" der
-- Chat DIESER Person.
--
-- Eine eigene Tabelle und keine Spalte in profiles: Das eigene Profil darf
-- jede Person selbst ändern. Stünde die Chat-Kennung dort, könnte jemand
-- eine fremde Kennung eintragen und seine Meldungen in einen fremden Chat
-- leiten. Hier schreibt NUR der Server (pages/api/telegram-verbindung.js),
-- und zwar erst, nachdem der Code im Chat angekommen ist.

create table if not exists telegram_verknuepfungen (
  user_id uuid primary key references profiles(id) on delete cascade,
  chat_id text,
  chat_name text,
  verbunden_am timestamptz,
  -- Der Einmal-Code und wann er ausgegeben wurde. Er gilt zehn Minuten.
  code text,
  code_seit timestamptz,
  -- Was die Person über Telegram bekommen will.
  tagesauswertung boolean not null default true,
  followups boolean not null default true,
  -- Für welchen Tag die Auswertung schon verschickt wurde — ein zweiter
  -- Lauf am selben Morgen schickt sie nicht noch einmal.
  auswertung_fuer date,
  updated_at timestamptz not null default now()
);

alter table telegram_verknuepfungen enable row level security;

-- Lesen nur die eigene Zeile. Schreiben gar nicht: Das macht der Server
-- mit erweiterten Rechten.
drop policy if exists "telegram_verknuepfung_eigene_lesen" on telegram_verknuepfungen;
create policy "telegram_verknuepfung_eigene_lesen" on telegram_verknuepfungen
  for select using (user_id = auth.uid());

-- 2) leads.kunde_am — wann jemand Kunde geworden ist
--
-- Ohne diesen Zeitpunkt kann die Auswertung nicht sagen, ob ein Kunde
-- gestern oder vor drei Wochen gewonnen wurde. Gesetzt von der Datenbank,
-- nicht vom Browser: Sonst liesse sich ein Abschluss auf einen beliebigen
-- Tag datieren.

alter table leads add column if not exists kunde_am timestamptz;

create or replace function setze_kunde_am() returns trigger
language plpgsql as $$
begin
  if new.outcome = 'kunde' then
    if tg_op = 'UPDATE' and old.outcome = 'kunde' then
      -- Bleibt Kunde (etwa beim Planen des Check-ins): der Zeitpunkt des
      -- Abschlusses bleibt, und niemand kann ihn nachträglich verschieben.
      new.kunde_am := old.kunde_am;
    else
      new.kunde_am := now();
    end if;
  else
    new.kunde_am := null;
  end if;
  return new;
end;
$$;

drop trigger if exists leads_kunde_am on leads;
create trigger leads_kunde_am
  before insert or update on leads
  for each row execute function setze_kunde_am();

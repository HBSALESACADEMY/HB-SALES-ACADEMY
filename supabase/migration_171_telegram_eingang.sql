-- Telegram schickt von sich aus — statt dass die Academy nachfragt.
--
-- Bisher holte die Academy neue Nachrichten ab: beim Öffnen der Seite und
-- morgens im Tageslauf. Wer dem Buddy abends schrieb, bekam die Antwort am
-- nächsten Morgen. Das ist keine Unterhaltung.
--
-- Mit dem Webhook (pages/api/telegram-eingang.js) liefert Telegram jede
-- Nachricht sofort. Diese Tabelle hält fest, was hereinkam:
--   1. Als Schutz gegen Doppelantworten: Telegram wiederholt eine Meldung,
--      wenn die Antwort zu lange dauert. Der Primärschlüssel verhindert,
--      dass sie zweimal beantwortet wird.
--   2. Für die Gruppensuche: Sobald ein Webhook aktiv ist, gibt Telegram
--      nichts mehr über getUpdates heraus. Die Suche liest deshalb hier.
--
-- Niemand liest das aus dem Browser: keine Leseregel, nur der Server.

create table if not exists telegram_updates (
  update_id bigint primary key,
  art text,
  chat_id text,
  chat_typ text,
  chat_name text,
  text text,
  gesendet_am timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists telegram_updates_zeit_idx on telegram_updates (created_at desc);

alter table telegram_updates enable row level security;

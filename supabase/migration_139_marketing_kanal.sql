-- Eigener Telegram-Kanal für die E-Mail-Kontakte.
--
-- Die Meldungen aus dem Marketing haben einen anderen Adressaten als
-- "Termin verschoben": dort muss jemand eine Mail schreiben, hier stellt
-- sich das Vertriebsteam auf einen Termin ein. In einem gemeinsamen Kanal
-- gehen beide unter — und untergegangene Meldungen sind schlimmer als
-- keine, weil man sich auf sie verlässt.
alter table organizations add column if not exists telegram_marketing_chat_id text;

comment on column organizations.telegram_marketing_chat_id is
  'Telegram-Kanal für E-Mail-Kontakte aus dem Call Tracker. Leer = es gilt der allgemeine Kanal.';

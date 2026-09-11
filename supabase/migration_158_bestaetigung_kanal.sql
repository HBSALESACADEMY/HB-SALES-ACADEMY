-- Eigener Telegram-Kanal für die Terminbestätigungen.
--
-- Dritter Kanal neben dem allgemeinen und dem fürs Marketing — aus
-- demselben Grund wie der zweite (migration_139): die Meldungen haben einen
-- anderen Adressaten. "Termin verschoben" geht an alle, die umplanen
-- müssen; "Setting Call bestätigt" geht an die, die dafür sorgen, dass
-- Termine stattfinden. In einem gemeinsamen Kanal gehen beide unter, und
-- untergegangene Meldungen sind schlimmer als keine, weil man sich auf sie
-- verlässt.
alter table organizations add column if not exists telegram_bestaetigung_chat_id text;

comment on column organizations.telegram_bestaetigung_chat_id is
  'Telegram-Kanal für Terminbestätigungen: Morgenliste der unbestätigten Termine und jede einzelne Bestätigung. Leer = es gilt der allgemeine Kanal.';

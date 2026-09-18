-- Die Teamlage für die Leitung: freitags per Telegram.
--
-- Zahlen, Themen und Frühwarnungen des Teams — ausdrücklich ohne einen
-- Satz aus den Buddy-Gesprächen (lib/teamlage.js). Zwei Spalten genügen:
-- ein Schalter und die Woche, für die sie schon raus ist.

alter table telegram_verknuepfungen add column if not exists teamlage boolean not null default true;
alter table telegram_verknuepfungen add column if not exists teamlage_fuer date;

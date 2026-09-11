-- Ein eigener Telegram-Kanal für die Abschlüsse.
--
-- "Kunde geworden" ging bisher in den allgemeinen Termin-Kanal und lag
-- dort zwischen Verschiebungen und Absagen. Die einzige Meldung, auf die
-- ein Vertriebsteam hinarbeitet, stand zwischen lauter Organisatorischem.
--
-- Ein Kanal, in dem ausschliesslich gute Nachrichten stehen, wird gelesen.
-- Das ist der ganze Grund — und der einzige, der eine vierte Gruppe
-- rechtfertigt.
alter table organizations add column if not exists telegram_abschluss_chat_id text;

comment on column organizations.telegram_abschluss_chat_id is
  'Telegram-Kanal für Abschlüsse ("Kunde geworden"). Leer = es gilt der allgemeine Kanal.';

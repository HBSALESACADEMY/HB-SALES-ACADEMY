-- Die Einwilligung in den Telegram-Bot festhalten.
--
-- Die Verbindung war schon immer freiwillig — niemand wird verbunden, ohne
-- es selbst zu tun. Nachweisen liess sich das aber nicht: Es gab kein
-- Häkchen und keinen Zeitpunkt. Genau das verlangt Art. 7 Abs. 1 DSGVO.
--
-- Der Widerruf braucht keine eigene Spalte: Wer trennt, verliert chat_id,
-- und ab dann geht nichts mehr an Telegram.

alter table telegram_verknuepfungen add column if not exists einwilligung_am timestamptz;

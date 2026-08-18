-- Jede Organisation kann eine eigene Telegram-Chat-ID hinterlegen, an die
-- Termin-Benachrichtigungen und -Erinnerungen gehen (zusätzlich zur E-Mail).
--
-- Sinnvoll ist meist eine Gruppe, in der das ganze Vertriebsteam sitzt —
-- dann sieht jeder sofort, wenn ein Termin steht. Leer = nur E-Mail.
alter table organizations add column if not exists telegram_chat_id text;

-- Der Vertriebsbuddy im Arbeitsalltag.
--
-- Bisher meldete er sich vor allem freitags. Jetzt auch morgens mit den
-- Terminen des Tages (Morgen-Briefing), fragt nach Terminen ohne Ergebnis
-- und spielt auf Wunsch den Kunden im Rollenspiel.
--
--   briefing       Schalter für das Morgen-Briefing (Einstellungen → Telegram)
--   briefing_fuer  der Tag, für den es schon raus ist — kein doppeltes Briefing
--   modus          was gerade im Chat läuft, z. B. 'rollenspiel'; leer = Gespräch
--   modus_daten    der Stand dazu (Szenario, Runden, bisheriger Wortwechsel)
--   modus_seit     seit wann — ein vergessenes Rollenspiel endet von selbst
--
-- Das Rollenspiel liegt bewusst hier und nicht in buddy_nachrichten: Es ist
-- eine Übung, kein Gespräch über die Woche. Es soll weder in den
-- Wochenrückblick noch in das Gedächtnis des Buddys einfliessen, und es
-- wird nach dem Ende gelöscht.

alter table telegram_verknuepfungen add column if not exists briefing boolean not null default true;
alter table telegram_verknuepfungen add column if not exists briefing_fuer date;
alter table telegram_verknuepfungen add column if not exists modus text;
alter table telegram_verknuepfungen add column if not exists modus_daten jsonb;
alter table telegram_verknuepfungen add column if not exists modus_seit timestamptz;

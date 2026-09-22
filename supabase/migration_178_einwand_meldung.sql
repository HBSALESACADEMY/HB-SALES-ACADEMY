-- Neue Einwandgründe melden — und die Meldung abschalten können.
--
-- Wer im Call Tracker einen eigenen Ablehnungsgrund eintippt
-- (migration_135), schickt damit einen Vorschlag an die Leitung. Bis jetzt
-- lag der dort, bis jemand von sich aus in Verwaltung → Einwände geschaut
-- hat. Genau das ist aber die Information, die schnell veraltet: Wenn drei
-- Leute in einer Woche denselben Einwand hören, gehört er diese Woche in
-- den Einwand-Trainer und nicht irgendwann.
--
-- Deshalb geht eine Meldung an die Leitung, sobald ein Grund mit NEUEM
-- Wortlaut auftaucht (siehe lib/einwandMeldung.js). Diese Spalte schaltet
-- sie ab — wie bei allen anderen Telegram-Meldungen auch.
--
-- Standard ist "an": Wer die Meldung nicht will, schaltet sie in den
-- Einstellungen aus. Umgekehrt wüsste niemand, dass es sie gibt.

alter table telegram_verknuepfungen add column if not exists einwaende boolean not null default true;

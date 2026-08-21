-- Persönliche Einstellungen.
--
-- benachrichtigungen: welche E-Mails jemand bekommen will. Leer = alles,
--   damit sich für bestehende Konten nichts ändert.
--   Schlüssel: termine, aufgaben, erwaehnungen, freigaben.
-- startseite: welcher Bereich nach dem Anmelden aufgeht.
-- abwesend_von/bis: Zeitraum, in dem jemand nicht erreichbar ist. Erspart
--   die Rückfrage, warum jemand eine Woche lang keine Anwahlen hat.
alter table profiles add column if not exists benachrichtigungen jsonb;
alter table profiles add column if not exists startseite text;
alter table profiles add column if not exists abwesend_von date;
alter table profiles add column if not exists abwesend_bis date;

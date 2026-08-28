-- Buchungslink für den Call Tracker (z. B. cal.com).
--
-- Beim Terminieren steht bisher nur eine Anleitung ("Buchungslink im eigenen
-- System öffnen"). Das Wichtigste — der Link selbst — musste woanders
-- gesucht werden, mitten im Gespräch. Jetzt liegt er hinterlegt und steht
-- als Knopf da, bevor das Formular kommt.
--
-- Zwei Ebenen, weil beides vorkommt: die Organisation hinterlegt einen
-- gemeinsamen Kalender, einzelne Vertriebler haben oft ihren eigenen. Der
-- persönliche gewinnt, sonst gilt der der Organisation.
alter table organizations add column if not exists booking_url text;
alter table profiles add column if not exists booking_url text;

-- Wessen Termine im Kalender-Abo landen — jetzt auswählbar.
--
-- "Alles oder nichts" reicht nicht: eine Teamleitung will oft die Termine
-- von drei Leuten sehen und nicht die von dreissig. Deshalb drei Zustände:
--
--   eigene   — nur die eigenen Termine (Voreinstellung)
--   team     — alle, die man führt, und zwar auch die, die morgen dazukommen
--   auswahl  — genau die Personen in kalender_personen
--
-- "team" bleibt bewusst neben "auswahl" bestehen: wer sein ganzes Team im
-- Kalender haben will, möchte nicht bei jeder Neueinstellung daran denken,
-- die Liste nachzuziehen.
--
-- kalender_personen ist ein FILTER, keine Berechtigung. Wer dort steht,
-- landet nur dann im Kalender, wenn die Rolle das beim Abruf auch hergibt —
-- sonst würde eine alte Auswahl nach einem Rollenwechsel weiterlaufen.
alter table profiles drop constraint if exists profiles_kalender_umfang_check;
alter table profiles add constraint profiles_kalender_umfang_check
  check (kalender_umfang in ('eigene', 'team', 'auswahl'));

alter table profiles add column if not exists kalender_personen uuid[] not null default '{}';

comment on column profiles.kalender_personen is
  'Bei kalender_umfang = auswahl: wessen Termine mit ins Abo gehen. Nur ein Filter — die Berechtigung wird bei jedem Abruf neu geprüft.';

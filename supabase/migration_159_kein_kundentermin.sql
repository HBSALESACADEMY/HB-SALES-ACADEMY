-- Nicht jeder Termin ist ein Kundentermin.
--
-- Anlass: In der Terminliste stand eine persönliche Erinnerung mit einem
-- Meet-Link. Sie bekam dieselbe Maske wie ein Interessent — Stufe,
-- Fortschrittsbalken, Ergebnis, Closing Call, Follow-up. Das ist nicht nur
-- unnütz, es ist falsch: die Auswertung zählte einen Verkaufsvorgang, den
-- es nie gab, und die Quoten des Teams wurden dadurch schlechter.
--
-- Ein Flag und keine zweite Tabelle: Der Eintrag steht bereits im
-- Kalender, hat einen Zeitpunkt und gehört einer Person. Ihn umzuziehen
-- hiesse, denselben Termin an zwei Orten führen zu können — und die Frage
-- "wo ist mein Termin hin" ist schlimmer als eine Spalte mehr.
alter table leads add column if not exists kein_kundentermin boolean not null default false;

create index if not exists leads_kundentermin_idx on leads (created_by, kein_kundentermin);

comment on column leads.kein_kundentermin is
  'true = persönlicher Termin, kein Verkaufsvorgang. Keine Stufe, kein Ergebnis, keine Auswertung — steht nur im Kalender und unter Sonstige.';

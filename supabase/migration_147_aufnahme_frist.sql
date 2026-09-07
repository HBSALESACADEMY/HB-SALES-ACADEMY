-- Aufnahmen werden nach einer Frist automatisch gelöscht.
--
-- Zwei Gründe, und der zweite ist der wichtigere:
--
-- 1. Der Speicher. Audio ist gross, und im kostenlosen Tarif ist bei 1 GB
--    Schluss — sichtbar wird das als "Upload fehlgeschlagen", also genau
--    dann, wenn jemand gerade arbeiten will.
-- 2. Aufbewahrung ohne Ende. Ein Gesprächsmitschnitt ist nach einem Monat
--    kein Lernmaterial mehr, sondern ein Datenbestand, den im Zweifel
--    jemand erklären muss. Eine Frist, die von selbst greift, ist die
--    einzige, die eingehalten wird.
alter table organizations add column if not exists aufnahme_frist_tage integer not null default 30;

comment on column organizations.aufnahme_frist_tage is
  'Nach so vielen Tagen werden Aufnahmen automatisch gelöscht. 0 = keine Frist.';

-- Die Ausnahme: Musterbeispiele. Ohne sie verliert man genau die
-- Aufnahmen, die als "so macht man das" taugen.
alter table call_recordings add column if not exists behalten boolean not null default false;

comment on column call_recordings.behalten is
  'Von der Löschfrist ausgenommen — für Musterbeispiele.';

-- Aufnahmen an Terminen fallen unter dieselbe Frist.
alter table leads add column if not exists aufnahme_behalten boolean not null default false;

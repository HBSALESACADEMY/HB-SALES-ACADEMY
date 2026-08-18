-- 1) Folgetermine: ein Folgetermin ist ein EIGENER Eintrag, der auf den
--    ursprünglichen verweist. Vorher wurde bei "Überlegt (Follow-up)" einfach
--    das Datum des bestehenden Termins überschrieben — der erste Termin und
--    sein Verlauf gingen dabei verloren.
alter table leads add column if not exists follow_up_of uuid references leads(id) on delete set null;
create index if not exists leads_follow_up_of_idx on leads(follow_up_of);

-- 2) Gesprächsnotizen aus der hochgeladenen Aufnahme (Notetaker, KEINE
--    Bewertung — die gibt es getrennt unter "Recordings").
--    status: pending = läuft, done = fertig, failed = fehlgeschlagen.
alter table leads add column if not exists call_notes jsonb;
alter table leads add column if not exists call_notes_status text
  check (call_notes_status in ('pending', 'done', 'failed'));

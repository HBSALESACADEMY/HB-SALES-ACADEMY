-- Migration 50: Aufnahme kann einem Kunden/Lead zugeordnet werden — direkte
-- Verknüpfung zwischen einer Recording und dem passenden Eintrag in "leads"
-- (Termine/Erfolge und Abschlüsse). Bei Löschung des Leads bleibt die
-- Aufnahme erhalten, nur die Verknüpfung fällt weg.
-- Einmalig im Supabase SQL Editor ausführen.

alter table call_recordings add column if not exists lead_id uuid references leads(id) on delete set null;

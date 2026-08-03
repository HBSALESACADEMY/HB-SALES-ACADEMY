-- Migration 48: Recordings bekommen eine automatische Einordnung durch die KI,
-- ob das Gespräch positiv (z.B. Termin/Abschluss) oder negativ (kein Erfolg)
-- verlaufen ist — getrennt vom reinen Qualitäts-Score, damit man in der Liste
-- gezielt nach gelungenen bzw. misslungenen Gesprächen filtern kann.
-- Einmalig im Supabase SQL Editor ausführen.

alter table call_recordings add column if not exists outcome text check (outcome in ('positiv', 'negativ'));

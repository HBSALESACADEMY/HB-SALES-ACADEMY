-- Migration 13: Stärken/Verbesserung/Beispielsätze dauerhaft im Rollenspiel-Verlauf speichern
-- Einmalig im Supabase SQL Editor ausführen.

alter table roleplay_sessions add column if not exists evaluation_detail jsonb;

-- Migration 10: Gemeinsamer Anfragen-Zähler für die Gemini-Anfragen-Drosselung
-- Einmalig im Supabase SQL Editor ausführen.

create table if not exists ai_request_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now()
);

-- Nur der Server (Service-Role-Key) greift hierauf zu, daher keine Policies nötig —
-- RLS ohne Policies sperrt den Zugriff über den öffentlichen Schlüssel komplett ab.
alter table ai_request_log enable row level security;

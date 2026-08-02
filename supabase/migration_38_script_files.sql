-- Migration 38: Datei-Anhänge für die Skript-Bibliothek (z.B. PDF-Leitfäden,
-- Vorlagen als Word-Dokument).
-- Einmalig im Supabase SQL Editor ausführen.

alter table scripts add column if not exists file_url text;
alter table scripts add column if not exists file_name text;

-- Öffentlich lesbar wie course-videos/org-logos — Skripte sind geteilte
-- Team-Inhalte, keine sensiblen Kundendaten.
insert into storage.buckets (id, name, public) values ('script-files', 'script-files', true)
on conflict (id) do nothing;

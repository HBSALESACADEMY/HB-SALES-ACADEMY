-- Migration 28: vollständiges Organisations-Theme — nicht nur Logo/Buttons/
-- Verlauf, sondern auch Hintergrund, Kartenfläche, Text und Rahmenfarbe.
-- Alle neuen Spalten sind nullable — bleibt eine leer, greift weiterhin das
-- heutige HB-Sales-Academy-Design als Standard (siehe lib/orgBranding.js).
-- Einmalig im Supabase SQL Editor ausführen.

alter table organizations add column if not exists background_color text;
alter table organizations add column if not exists surface_color text;
alter table organizations add column if not exists text_color text;
alter table organizations add column if not exists muted_color text;
alter table organizations add column if not exists border_color text;

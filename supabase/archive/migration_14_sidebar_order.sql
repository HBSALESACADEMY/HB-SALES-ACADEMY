-- Migration 14: Persönliche Sidebar-Reihenfolge
-- Einmalig im Supabase SQL Editor ausführen.

alter table profiles add column if not exists sidebar_prefs jsonb not null default '{}'::jsonb;

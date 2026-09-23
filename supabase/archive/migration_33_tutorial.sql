-- Migration 33: Geführtes Tutorial
-- Einmalig im Supabase SQL Editor ausführen.

alter table profiles add column if not exists tutorial_seen boolean not null default false;

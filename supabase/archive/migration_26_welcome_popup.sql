-- Migration 26: Willkommens-Popup für neue Nutzer
-- Einmalig im Supabase SQL Editor ausführen.

alter table profiles add column if not exists welcome_seen boolean not null default false;

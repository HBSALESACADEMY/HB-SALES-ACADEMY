-- Migration 12: Kontaktdaten-Felder im Profil
-- Einmalig im Supabase SQL Editor ausführen.

alter table profiles add column if not exists company_name text;
alter table profiles add column if not exists role_title text;
alter table profiles add column if not exists website text;
alter table profiles add column if not exists instagram text;
alter table profiles add column if not exists linkedin text;
alter table profiles add column if not exists phone text;

-- Diese Felder sind für alle freigegebenen Nutzer sichtbar (nutzt die bereits
-- bestehende Policy "profiles_select_leaderboard": status = 'approved').

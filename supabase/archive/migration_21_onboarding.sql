-- Migration 21: Onboarding-Checkliste
-- Einmalig im Supabase SQL Editor ausführen.

alter table profiles add column if not exists onboarding_dismissed boolean not null default false;

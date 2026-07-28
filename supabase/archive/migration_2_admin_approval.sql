-- Migration 2: Admin-Rolle + Registrierungs-Freigabe
-- Einmalig im Supabase SQL Editor ausführen (bestehendes Projekt).

alter table profiles add column if not exists is_admin boolean not null default false;
alter table profiles add column if not exists status text not null default 'pending'
  check (status in ('pending', 'approved', 'rejected'));

-- Bestehende Nutzer (die schon aktiv arbeiten) automatisch freischalten,
-- damit niemand durch dieses Update ausgesperrt wird.
update profiles set status = 'approved' where status = 'pending';

-- Dich selbst zum Admin machen (ersetze die UUID durch deine eigene,
-- zu finden unter Authentication → Users):
-- update profiles set is_admin = true where id = '<deine-uuid>';

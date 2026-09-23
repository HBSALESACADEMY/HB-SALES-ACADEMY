-- Migration 13: Sichtbarkeits-Einstellungen & Dashboard-Anpassung
-- Einmalig im Supabase SQL Editor ausführen.

alter table profiles add column if not exists contact_visibility jsonb not null default '{}'::jsonb;
alter table profiles add column if not exists dashboard_prefs jsonb not null default '{}'::jsonb;

-- Neuer Sidebar-Reiter
insert into nav_items (key, label, icon, route, is_builtin, requires_manager, order_index) values
  ('settings', 'Einstellungen', 'lock', '/settings', true, false, 19)
on conflict (key) do nothing;

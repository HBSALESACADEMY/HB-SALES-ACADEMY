-- Migration 22: Call-Tracker-Auswertung (Nav-Eintrag)
-- Einmalig im Supabase SQL Editor ausführen.

insert into nav_items (key, label, icon, route, is_builtin, requires_manager, order_index) values
  ('admin-call-stats', 'Anruf-Auswertung', 'target', '/admin/call-stats', true, true, 22)
on conflict (key) do nothing;

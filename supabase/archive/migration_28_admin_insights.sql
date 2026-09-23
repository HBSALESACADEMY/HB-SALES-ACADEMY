-- Migration 28: Admin-Insights-Dashboard
-- Einmalig im Supabase SQL Editor ausführen.

insert into nav_items (key, label, icon, route, is_builtin, requires_manager, order_index) values
  ('admin-insights', 'Insights', 'dashboard', '/admin/insights', true, true, 5)
on conflict (key) do nothing;

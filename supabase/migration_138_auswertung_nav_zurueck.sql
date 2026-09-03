-- Den Menüpunkt "Auswertung" wieder anlegen.
--
-- Kurzzeitig lag die Vertriebsauswertung im Verwaltungsbereich. Das war die
-- falsche Stelle: sie wird täglich gelesen, die Verwaltung betritt man
-- selten. Sie ist deshalb wieder ein eigener Reiter in der Sidebar —
-- sichtbar nur für Führungsrollen, wie schon in migration_127.
--
-- (Rücknahme von migration_136 und der zweiten Zeile aus migration_137.)
insert into nav_items (key, label, icon, route, is_builtin, requires_manager, visible, order_index)
values ('auswertung', 'Auswertung', 'chart', '/auswertung', true, true, true,
        coalesce((select order_index from nav_items where key = 'manager'), 60) - 1)
on conflict (key) do update
  set label = excluded.label, icon = excluded.icon, route = excluded.route,
      visible = true, requires_manager = true;

-- Navigationspunkt für die Management-Auswertung.
--
-- requires_manager = true: die Seite stellt Menschen nebeneinander und
-- benennt, wer zurückliegt. Sie gehört Teamleitungen und der
-- Vertriebsleitung. Das Ausblenden im Menü ist dabei nur die Höflichkeit —
-- geschützt wird die Auswertung auf dem Server (pages/api/auswertung.js),
-- der die Rolle prüft, bevor er überhaupt etwas liest.
insert into nav_items (key, label, icon, route, is_builtin, requires_manager, visible, order_index)
values ('auswertung', 'Auswertung', 'chart', '/auswertung', true, true, true,
        coalesce((select order_index from nav_items where key = 'manager'), 60) - 1)
on conflict (key) do update
  set label = excluded.label, icon = excluded.icon, route = excluded.route,
      visible = true, requires_manager = true;

-- Der Firmenkalender (pages/kalender.js) war fertig, stand aber in keiner
-- Seitenleiste — die Einträge der Navigation liegen in der Datenbank, nicht
-- im Code. Ohne diese Zeile ist die Seite nur über die Adresse erreichbar.
--
-- organization_id bleibt leer: der Punkt gehört wie Dashboard oder Kurse
-- allen Organisationen, nicht einer bestimmten (siehe migration_53).
-- Reihenfolge: direkt hinter die Termine, weil beides Kalender ist.
insert into nav_items (key, label, icon, route, is_builtin, requires_manager, visible, order_index)
values (
  'kalender',
  'Kalender',
  'calendar',
  '/kalender',
  true,
  false,
  true,
  coalesce((select order_index from nav_items where key = 'termine'), 50) + 1
)
on conflict (key) do update
  set label = excluded.label,
      icon = excluded.icon,
      route = excluded.route,
      visible = true,
      requires_manager = false;

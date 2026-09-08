-- Navigationspunkt für das Follow-up.
--
-- Ein Termin ist mit dem Termin nicht zu Ende: wahrgenommen ohne Ergebnis
-- heisst, dass jemand nachfassen muss, abgesagt heisst, dass nur der
-- Zeitpunkt weg ist. Beides verschwand in der langen Terminliste zwischen
-- den bevorstehenden Terminen — und damit aus dem Kopf.
--
-- Für alle sichtbar: was jemand dort sieht, entscheiden die Zugriffsregeln
-- auf leads. Eine Vertriebsperson sieht ihre eigenen Termine, die Leitung
-- die ihrer Organisation.
insert into nav_items (key, label, icon, route, is_builtin, requires_manager, visible, order_index)
values ('follow-up', 'Follow-up', 'history', '/follow-up', true, false, true,
        coalesce((select order_index from nav_items where key = 'termine'), 20) + 1)
on conflict (key) do update
  set label = excluded.label, icon = excluded.icon, route = excluded.route,
      visible = true, requires_manager = false;

-- Den Menüpunkt "Navigation verwalten" entfernen.
--
-- Die Seite gibt es nicht mehr: die Sidebar-Struktur klappt jetzt bei
-- "Kurse & Module" auf, weil man sie genau dann braucht, wenn beim Anlegen
-- eines Kurses der passende Ordner fehlt.
--
-- Der Eintrag im Menü blieb dabei zurück und führte ins Leere. Er wird hier
-- entfernt; zusätzlich filtert die Academy diese Route immer aus, damit ein
-- toter Link nicht davon abhängt, ob jemand diese Migration einspielt.
delete from nav_items where route = '/admin/navigation' or key = 'navigation';

-- Gleiches Aufräumen für die Führungsauswertung (siehe migration_136).
delete from nav_items where key = 'auswertung' or route = '/auswertung';

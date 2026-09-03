-- Den Menüpunkt "Auswertung" wieder entfernen (Gegenstück zu migration_127).
--
-- Die Führungsauswertung liegt im Verwaltungsbereich unter Auswertung →
-- Vertrieb. Ein zweiter Weg über die Sidebar wäre derselbe Ort an zwei
-- Stellen — und in der Navigationsverwaltung stand damit ein Punkt, den man
-- sortieren und umbenennen konnte, ohne dass es irgendetwas bewirkte.
--
-- Die Seite selbst bleibt unter /auswertung erreichbar; entfernt wird nur
-- der Eintrag im Menü.
delete from nav_items where key = 'auswertung';

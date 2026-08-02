-- Migration 37: "Termine" Sidebar-Eintrag bekommt ein Kalender-Icon statt
-- des Ziel-Icons (migration_35 hatte versehentlich "target" genutzt).
-- Die Gruppenzuordnung (Team statt Lernen) ist rein clientseitig in
-- components/Layout.js geregelt und braucht keine DB-Änderung.
-- Einmalig im Supabase SQL Editor ausführen.

update nav_items set icon = 'calendar' where key = 'termine';

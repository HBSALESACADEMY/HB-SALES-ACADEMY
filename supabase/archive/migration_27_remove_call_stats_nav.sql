-- Migration 27: "Anruf-Auswertung"-Menüpunkt entfernen
-- (Die Team-Ansicht mit Diagrammen ist jetzt direkt im Call Tracker selbst,
-- als eigener Tab neben Heute/Woche/Monat — kein separater Menüpunkt mehr nötig.)
-- Einmalig im Supabase SQL Editor ausführen.

delete from nav_items where key = 'admin-call-stats';

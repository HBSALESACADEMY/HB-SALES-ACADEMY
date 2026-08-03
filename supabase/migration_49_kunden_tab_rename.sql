-- Migration 49: "Kunden"-Reiter in "Erfolge und Abschlüsse" umbenannt — der
-- Reiter erlaubt jetzt zusätzlich, einen Abschluss direkt manuell
-- einzutragen (ohne vorher einen Termin im Call Tracker anzulegen).
-- Einmalig im Supabase SQL Editor ausführen.

update nav_items set label = 'Erfolge und Abschlüsse' where key = 'kunden';

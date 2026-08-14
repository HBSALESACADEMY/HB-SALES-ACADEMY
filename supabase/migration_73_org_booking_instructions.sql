-- Weißes Label für Call Tracker: der Terminierungs-Schritt darf nicht auf
-- HBs eigene Tools ("Close", "Cal") verweisen. Jede Organisation kann hier
-- ihre eigene Anleitung hinterlegen (siehe pages/admin/organization.js);
-- bleibt das Feld leer, zeigt public/tools/call-tracker.html eine
-- allgemeine Standard-Anleitung ohne Tool-Namen.
alter table organizations add column if not exists booking_instructions text;

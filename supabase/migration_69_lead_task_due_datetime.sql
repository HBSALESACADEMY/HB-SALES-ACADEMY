-- Fälligkeit einer Aufgabe braucht auch eine Uhrzeit, nicht nur ein Datum.
alter table lead_tasks alter column due_date type timestamptz using due_date::timestamptz;

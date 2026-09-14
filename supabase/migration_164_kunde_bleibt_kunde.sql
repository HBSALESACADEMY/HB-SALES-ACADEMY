-- Kunde bleibt Kunde, auch nach dem Planen des Check-ins.
--
-- Beim Weiterrücken auf eine neue Stufe wurde das Ergebnis geleert — auch
-- "kunde". Wer nach dem Abschluss den Check-in plante, verlor damit den
-- Kunden: Der Balken sprang von 85 % zurück, und der Kontakt fehlte in der
-- Kundenliste, der Auswertung und bei den Zielen "Kunden gewonnen".
--
-- Die Academy lässt "kunde" beim Weiterrücken jetzt stehen. Diese
-- Migration repariert die Einträge, die schon vorher weitergerückt sind:
-- Bei ihnen steht das "kunde" nur noch in der abgeschlossenen Stufe im
-- Verlauf.

update leads
set outcome = 'kunde'
where outcome is null
  and exists (
    select 1
    from jsonb_array_elements(coalesce(stufen_verlauf, '[]'::jsonb)) as stufe
    where stufe->>'ergebnis' = 'kunde'
  );

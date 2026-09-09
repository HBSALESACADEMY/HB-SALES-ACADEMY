-- Die Stufe nach dem Abschluss.
--
-- Mit dem Geld ist es nicht fertig: Der Anruf einen Monat später — "läuft
-- alles?" — ist die einzige Stufe, die NACH dem Abschluss kommt. Und weil
-- danach niemand mehr etwas verkaufen will, wird sie ohne einen festen
-- Platz im System immer vergessen.
alter table leads drop constraint if exists leads_termin_art_check;
alter table leads add constraint leads_termin_art_check
  check (termin_art is null or termin_art in ('erstgespraech', 'folgetermin', 'closing', 'checkin'));

comment on column leads.termin_art is
  'Stufe im Verkauf: erstgespraech, folgetermin (Kunde überlegt), closing, checkin (ein Monat nach Abschluss). Leer = Erstgespräch.';

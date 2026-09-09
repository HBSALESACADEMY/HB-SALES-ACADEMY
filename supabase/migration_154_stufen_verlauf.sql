-- Der Weg eines Interessenten durch die Stufen.
--
-- Ein Kontakt ist EIN Eintrag, der weiterrückt: aus dem Setting-Termin wird
-- ein Folgetermin, daraus ein Closing Call. Kein zweiter Eintrag, keine
-- Dublette in der Liste.
--
-- Genau so war es früher schon einmal, und es wurde aus einem guten Grund
-- geändert: mit dem Datum ging die Geschichte verloren. Niemand wusste mehr,
-- wann das Erstgespräch war, und in der Auswertung gab es plötzlich nur
-- noch Closing Calls.
--
-- Deshalb diesmal mit Verlauf: der Termin rückt weiter, aber jede Stufe
-- bleibt mit ihrem Datum stehen. Beides zusammen — eine Zeile in der Liste
-- und trotzdem die volle Geschichte.
alter table leads add column if not exists stufen_verlauf jsonb not null default '[]'::jsonb;

comment on column leads.stufen_verlauf is
  'Jede Stufe mit ihrem Datum: [{art, am, von}]. Der Termin rückt weiter, die Geschichte bleibt.';

-- Der Betreff der zuletzt verschickten Mail.
--
-- Er stand vorher in der Gesprächsnotiz: nach jedem Versand wurde dort eine
-- Zeile angehängt. Weil {{notiz}} aber in den Vorlagen steht, landete diese
-- Historie in der nächsten Mail beim Kunden — nach drei Versuchen dreimal
-- untereinander.
--
-- Die Notiz ist, was im Gespräch gesagt wurde. Was die Academy selbst
-- verschickt hat, gehört woanders hin.
alter table email_kontakte add column if not exists letzter_betreff text;

comment on column email_kontakte.letzter_betreff is
  'Betreff der zuletzt verschickten Mail. Getrennt von der Gesprächsnotiz, die in Vorlagen eingesetzt wird.';

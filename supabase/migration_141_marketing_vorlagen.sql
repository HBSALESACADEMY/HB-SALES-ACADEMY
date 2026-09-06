-- Mail-Vorlagen und die Wiedervorlage.
--
-- Bisher führte der Weg über einen mailto-Link: man landet im eigenen
-- Mailprogramm, schreibt dort und muss danach daran denken, hier
-- abzuhaken. Der vergessene Haken ist der Regelfall, nicht die Ausnahme.
--
-- Die Vorlagen liegen als JSON an der Organisation statt in einer eigenen
-- Tabelle: es sind wenige, sie werden immer zusammen geladen, und eine
-- Tabelle mit drei Zeilen je Organisation bringt nur Verwaltungsaufwand.
alter table organizations add column if not exists email_vorlagen jsonb not null default '[]'::jsonb;

comment on column organizations.email_vorlagen is
  'Mail-Vorlagen fürs E-Mail-Marketing: [{name, betreff, text}] mit Platzhaltern wie {{name}} (lib/marketingVorlage.js).';

-- Wann zuletzt an diesen Kontakt erinnert wurde. Ohne diesen Merker würde
-- die Erinnerung jeden Tag erneut kommen — und eine Erinnerung, die täglich
-- kommt, liest nach drei Tagen niemand mehr.
alter table email_kontakte add column if not exists erinnert_am timestamptz;

comment on column email_kontakte.erinnert_am is
  'Letzte Nachfass-Erinnerung. Verhindert, dass dieselbe Erinnerung täglich erneut kommt.';

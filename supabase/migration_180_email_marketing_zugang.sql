-- Wer das E-Mail-Marketing sehen darf.
--
-- Der Schalter aus migration_179 kennt nur an und aus. Das ist zu grob:
-- Mailschreiben ist das bequeme Werkzeug — für manche im Team genau
-- richtig, für andere die Ausrede, nicht zum Telefon zu greifen. Die
-- Leitung soll es deshalb für einzelne Personen freigeben können, ohne es
-- allen wegzunehmen.
--
-- 'alle'    — jede Person der Organisation (Standard, wie bisher)
-- 'leitung' — nur Führungsrollen
-- 'auswahl' — die Personen in email_marketing_personen, plus die Leitung
--
-- Die Leitung kann immer, solange es überhaupt eingeschaltet ist: Sie legt
-- die Vorlagen an und trägt die Verantwortung für das, was nach draussen
-- geht. Eine Leitung, die sich selbst aussperrt, könnte nichts mehr
-- einrichten und würde das für einen Fehler der Academy halten.
--
-- Der Standard ist 'alle': Eine Änderung, die stillschweigend jemandem
-- etwas wegnimmt, wäre schlimmer als keine.

alter table organizations add column if not exists email_marketing_zugang text
  not null default 'alle'
  check (email_marketing_zugang in ('alle', 'leitung', 'auswahl'));

alter table organizations add column if not exists email_marketing_personen jsonb
  not null default '[]'::jsonb;

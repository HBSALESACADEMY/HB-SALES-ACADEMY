-- Anrede beim E-Mail-Kontakt.
--
-- "Hallo Frau Schmidt" statt "Hallo Maria Schmidt": eine Marketing-Mail an
-- einen Geschäftskontakt, die den Vornamen benutzt, wirkt wie
-- Massenversand — und genau das soll sie nicht.
--
-- Frei lassen ist ausdrücklich erlaubt: wer im Gespräch nur einen Namen
-- aufschnappt, soll nicht raten müssen. Die Vorlage kommt damit zurecht.
alter table email_kontakte add column if not exists anrede text
  check (anrede is null or anrede in ('herr', 'frau'));

comment on column email_kontakte.anrede is
  'Anrede für die Mail: herr, frau oder leer. Füllt den Platzhalter {{anrede}}.';

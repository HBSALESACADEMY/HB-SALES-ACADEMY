-- Eigene Absender- und Antwortadresse je Organisation.
--
-- Bisher stand die Absenderadresse global in einer Umgebungsvariable und
-- galt für alle. Für eine Organisation, die Marketing-Mails an ihre eigenen
-- Kontakte schickt, ist das falsch: dort soll der eigene Name stehen, und
-- eine Antwort muss beim eigenen Postfach ankommen.
--
-- Zwei Felder, weil sie zwei ganz verschiedene Voraussetzungen haben:
--
--   absender    — muss auf einer bei Resend VERIFIZIERTEN Domain liegen.
--                 Eine beliebige Adresse einzutragen führt dazu, dass gar
--                 keine Mail mehr rausgeht. Deshalb optional, mit Hinweis.
--   antwort_an  — kann JEDE Adresse sein, auch eine GMX- oder Gmail-Adresse.
--                 Sie steht nicht im Absender, sondern nur dort, wo die
--                 Antwort hingeht. Das ist der Weg, der ohne DNS-Einträge
--                 funktioniert, und für die meisten der eigentlich gemeinte.
alter table organizations add column if not exists email_absender text;
alter table organizations add column if not exists email_antwort_an text;

comment on column organizations.email_absender is
  'Absenderadresse für Mails dieser Organisation. Muss bei Resend verifiziert sein — sonst wird gar nichts versendet. Leer = die globale Adresse.';
comment on column organizations.email_antwort_an is
  'Antwortadresse (Reply-To). Beliebige Adresse, keine Verifizierung nötig — hier landen die Antworten der Kontakte.';

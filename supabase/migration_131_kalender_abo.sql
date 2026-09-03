-- Persönlicher Schlüssel für das Kalender-Abo.
--
-- Ein Abo-Kalender wird von Apple, Google oder Outlook im Hintergrund
-- abgerufen — ohne Anmeldung, ohne Sitzung, ohne Cookie. Die einzige Form
-- von Ausweis, die dabei funktioniert, ist ein Geheimnis in der Adresse.
--
-- Deshalb ein eigener, zufälliger Schlüssel je Person und ausdrücklich NICHT
-- die Nutzer-Kennung: die steht an vielen Stellen und wäre nicht geheim.
-- Wer den Schlüssel weitergibt, gibt seine Termine weiter — darum lässt er
-- sich jederzeit neu erzeugen, und der alte ist damit sofort wertlos.
--
-- Der Schlüssel erlaubt ausschliesslich Lesen, und nur die Termine dieser
-- einen Person (siehe pages/api/kalender-abo.js).
alter table profiles add column if not exists kalender_token uuid;

create unique index if not exists profiles_kalender_token_idx
  on profiles (kalender_token) where kalender_token is not null;

comment on column profiles.kalender_token is
  'Geheimnis für das Kalender-Abo (nur Lesen, nur eigene Termine). Neu erzeugen macht den alten Link wertlos.';

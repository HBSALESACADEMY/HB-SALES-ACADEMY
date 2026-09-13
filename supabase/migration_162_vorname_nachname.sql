-- Vorname und Nachname getrennt erfassen.
--
-- Bisher gab es ein Feld "Name", und die Mail setzte als Nachnamen das
-- letzte Wort ein. Das geht bei "Karl-Heinz Müller" gut und bei "Anna von
-- der Heide" oder "Maria de la Cruz" schief: aus "Guten Tag Frau Heide"
-- merkt der Kunde sofort, dass eine Maschine geschrieben hat.
--
-- "name" bleibt bestehen und wird beim Speichern aus beiden Teilen gebildet.
-- Alles, was bisher "name" liest — die Liste, der Termin, der daraus
-- entsteht, die Meldungen —, läuft unverändert weiter. Alte Kontakte ohne
-- getrennte Felder behalten ihren Namen; für sie gilt weiter das letzte
-- Wort als Nachname.
alter table email_kontakte add column if not exists vorname text;
alter table email_kontakte add column if not exists nachname text;

comment on column email_kontakte.nachname is
  'Nachname für die Anrede in Mails ({{nachname}}). Leer bei alten Kontakten — dann gilt das letzte Wort aus name.';

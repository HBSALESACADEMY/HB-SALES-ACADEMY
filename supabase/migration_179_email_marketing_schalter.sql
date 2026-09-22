-- E-Mail-Marketing je Organisation an- und ausschalten.
--
-- Mailschreiben fühlt sich nach Arbeit an und ist bequemer als
-- telefonieren. Wenn die Anwahlen fallen, seit es die Funktion gibt, muss
-- die Leitung sie abschalten können — und danach darf auch über den Call
-- Tracker keine Mail mehr rausgehen, nicht nur der Knopf verschwinden.
--
-- Standard ist "an": Ein Schalter, der stillschweigend abschaltet, was
-- gestern noch lief, wäre schlimmer als gar keiner.
--
-- Abgeschaltet wird nur, was Vertriebler selbst an Kunden schicken.
-- Termin-Benachrichtigungen, Einladungen und das Zurücksetzen von
-- Passwörtern laufen weiter, und gelöscht wird nichts: Kontakte, Verlauf
-- und Vorlagen stehen wieder da, sobald der Schalter wieder an ist.

alter table organizations add column if not exists email_marketing_aktiv boolean not null default true;

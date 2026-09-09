-- Die Art eines Termins.
--
-- Ein Closing Call ist etwas anderes als ein Folgetermin. "Der Kunde
-- überlegt noch" und "jetzt wird abgeschlossen" sehen in der Terminliste
-- gleich aus, sind aber verschiedene Stufen — und für die Frage, wo im
-- Verkauf es hakt, ist genau dieser Unterschied die Antwort.
--
-- Ohne Angabe gilt ein Termin als Erstgespräch: das ist er in aller Regel,
-- und bestehende Termine sollen nicht umgedeutet werden.
alter table leads add column if not exists termin_art text
  check (termin_art is null or termin_art in ('erstgespraech', 'folgetermin', 'closing'));

create index if not exists leads_termin_art_idx on leads (organization_id, termin_art);

comment on column leads.termin_art is
  'Stufe im Verkauf: erstgespraech, folgetermin oder closing. Leer = Erstgespräch.';

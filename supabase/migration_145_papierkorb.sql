-- Papierkorb statt endgültigem Löschen.
--
-- Termine, Kontakte und Aufnahmen sind heute sofort weg. Ein Fehlklick
-- kostet Arbeit, die niemand wiederherstellen kann — im kostenlosen
-- Supabase-Tarif gibt es kein Backup, aus dem sich eine einzelne Zeile
-- zurückholen liesse.
--
-- Ein Kennzeichen ist billiger als jedes Backup: die Zeile bleibt stehen,
-- verschwindet aber überall aus der Anzeige.
alter table leads add column if not exists geloescht_am timestamptz;
alter table email_kontakte add column if not exists geloescht_am timestamptz;

comment on column leads.geloescht_am is
  'Papierkorb: gesetzt heisst gelöscht. Die Zeile bleibt 30 Tage stehen und lässt sich zurückholen.';

create index if not exists leads_papierkorb_idx on leads (created_by, geloescht_am);
create index if not exists email_kontakte_papierkorb_idx on email_kontakte (organization_id, geloescht_am);

-- Gelöschtes taucht in keiner Abfrage mehr auf. Die Zugriffsregeln bleiben
-- unverändert — das Ausblenden gehört in die Abfragen der Anwendung, nicht
-- in die Rechte: sonst käme man an den Papierkorb selbst nicht mehr heran.

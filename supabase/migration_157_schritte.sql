-- Die Schritte zwischen den Gesprächen.
--
-- Ein Verkauf besteht nicht nur aus Terminen. Vor dem Setting Call und vor
-- dem Closing Call steht die Bestätigung — der Anruf oder die Mail, die
-- dafür sorgt, dass der Termin auch stattfindet. Das ist der billigste
-- Schritt im ganzen Ablauf und der, der am häufigsten unterbleibt: ein
-- unbestätigter Termin platzt, und hinterher weiss niemand, ob jemand
-- nachgehakt hat.
--
-- Nach dem Abschluss kommt die Projektumsetzung. Auch sie ist kein Termin,
-- sondern ein Haken.
--
-- Als jsonb und nicht als drei Spalten: welche Schritte es gibt, steht in
-- lib/terminArt.js und wird sich ändern. Jede Änderung daran wäre sonst
-- eine Migration, und Migrationen laufen hier von Hand.
alter table leads add column if not exists schritte jsonb not null default '{}'::jsonb;

comment on column leads.schritte is
  'Abgehakte Schritte: {"setting_bestaetigt":{"am":"...","von":"uuid"}, ...}. Schlüssel siehe lib/terminArt.js SCHRITTE.';

-- Die Projektumsetzung hakt die Vertriebsleitung ab, nicht der Vertrieb.
--
-- Wer verkauft hat, ist nicht die Person, die beurteilt, ob geliefert
-- wurde. Diese Grenze steht deshalb in der Datenbank und nicht nur in der
-- Maske: eine Regel, die nur in der Oberfläche gilt, hält genau so lange,
-- bis jemand den Weg daran vorbei findet.
--
-- Geprüft wird nur die ÄNDERUNG dieses einen Schlüssels. Alles andere an
-- der Zeile darf der Vertrieb weiter bearbeiten — sonst wäre der Termin
-- für die Person gesperrt, der er gehört.
create or replace function public.pruefe_schritte()
returns trigger
language plpgsql
security definer as $$
begin
  -- Ohne angemeldete Person läuft der Server mit erweiterten Rechten
  -- (Cron, Tagesbericht). Dort greift diese Grenze nicht; wer über die
  -- Zugriffsregeln hereinkommt, ist ohnehin angemeldet.
  if auth.uid() is null then
    return new;
  end if;

  if (new.schritte -> 'projektumsetzung') is distinct from (old.schritte -> 'projektumsetzung')
     and not ist_fuehrungsrolle(auth.uid()) then
    raise exception 'Die Projektumsetzung hakt die Vertriebsleitung ab.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists leads_schritte_pruefen on leads;
create trigger leads_schritte_pruefen
  before update on leads
  for each row
  execute function public.pruefe_schritte();

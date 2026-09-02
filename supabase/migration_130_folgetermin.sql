-- Folgetermine für Termine anderer Personen anlegen dürfen.
--
-- Der Fehler: "new row violates row-level security policy for table leads".
--
-- Ein Folgetermin behält bewusst die ursprüngliche Person als created_by —
-- der Termin gehört weiter dem Vertriebler, sonst stünde plötzlich die
-- Führungskraft in dessen Statistik und der Termin fehlte in seiner. Die
-- Insert-Regel verlangte aber "created_by = auth.uid()". Legt also eine
-- Führungskraft einen Folgetermin zum Gespräch einer Vertriebsperson an,
-- lehnt die Datenbank die Zeile ab.
--
-- Neu darf man eine Zeile auch für jemand anderen anlegen — aber nur, wenn
-- man diese Person ohnehin führt und sie in der aktiven Organisation ist.
-- Das ist dieselbe Grenze, die beim Ändern eines Termins schon gilt
-- (leads_update): wer einen fremden Termin bearbeiten darf, darf auch
-- dessen Folgetermin anlegen.
drop policy if exists "leads_insert" on leads;
create policy "leads_insert" on leads for insert with check (
  -- Die Mandanten-Grenze steht wie überall VOR allen anderen Gründen.
  (organization_id is null or organization_id is not distinct from aktive_org(auth.uid()))
  and (
    created_by = auth.uid()
    or (
      sieht_person(created_by)
      and (ist_fuehrungsrolle(auth.uid()) or is_team_lead_of(created_by, auth.uid()))
    )
  )
);

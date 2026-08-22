-- Wer einen Vertriebstermin sehen darf.
--
-- Bisher: wer ihn angelegt hat, eine Führungsrolle der Organisation, und
-- wer per Aufgabe oder Erwähnung damit zu tun hat (migration_77/79/92).
--
-- Es fehlten zwei Gruppen:
--
-- 1. EINGELADENE. Seit migration_112 kann man Leute zu einem Termin
--    einladen — ohne diese Regel sähen sie den Termin, zu dem sie zugesagt
--    haben, nirgends. Der Kalender hat sich das bisher über den
--    Admin-Zugang zurechtgelegt; eine Ausnahme in der Anwendung ist aber
--    keine Berechtigung, sie gilt nur dort, wo jemand daran gedacht hat.
--
-- 2. TEAMLEITUNGEN. Wer ein Team führt, sieht die Termine seines Teams —
--    unabhängig von der Rolle "manager". Genau dafür ist die Leitung da.
--
-- Alles andere bleibt, wie es war: ein Termin ist nichts, was die ganze
-- Organisation angeht.
create or replace function public.ist_zu_termin_eingeladen(p_lead_id uuid)
returns boolean
language sql stable security definer as $$
  select exists (
    select 1 from termin_einladungen
    where quelle = 'lead' and ziel_id = p_lead_id and person_id = auth.uid()
  );
$$;

drop policy if exists "leads_select" on leads;
create policy "leads_select" on leads for select using (
  created_by = auth.uid()
  -- Führungsrolle: nur innerhalb der AKTIVEN Organisation (migration_92).
  or (ist_fuehrungsrolle(auth.uid()) and sieht_person(created_by))
  -- Teamleitung sieht die Termine der eigenen Teammitglieder.
  -- is_team_lead_of prüft die gemeinsame Organisation selbst mit.
  or is_team_lead_of(created_by, auth.uid())
  -- Zugewiesen oder erwähnt (migration_77). Über die Hilfsfunktion statt
  -- direkt, sonst Endlosschleife (migration_79).
  or has_lead_task_or_mention(leads.id)
  -- Eingeladen (migration_112). Ebenfalls über eine Funktion: sonst würde
  -- die Regel von termin_einladungen mit der von leads ineinandergreifen.
  or ist_zu_termin_eingeladen(leads.id)
);

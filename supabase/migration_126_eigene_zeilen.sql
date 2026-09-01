-- Was mir gehört, sehe ich immer — Rückbau eines Fehlers aus migration_115.
--
-- Gemeldet: Aufnahmen lassen sich nicht mehr hochladen. Ursache: Ich hatte
-- beim Aufräumen an den EIGENEN Zweig der Leseregel ein sieht_person()
-- gehängt. Das prüft "gehört diese Person zu der Organisation, in der ich
-- gerade bin" — für ein normales Konto immer wahr, für einen Plattform-Admin
-- per Firmencode aber falsch: seine Heimat ist eine andere.
--
-- Folge: Er durfte seine eigenen Aufnahmen nicht mehr lesen. Und weil die
-- Anwendung direkt nach dem Speichern die neue Zeile zurückliest, sah das
-- aus wie ein fehlgeschlagener Upload — obwohl die Datei längst im Speicher
-- lag.
--
-- Richtig ist: eigene Zeilen ohne Bedingung. Die Mandanten-Grenze gilt für
-- FREMDE Zeilen, nicht für die eigenen — sonst sperrt man Leute aus ihren
-- eigenen Daten aus.
drop policy if exists "call_recordings_select" on call_recordings;
create policy "call_recordings_select" on call_recordings for select using (
  created_by = auth.uid()
  or (visibility = 'org' and same_org(created_by, auth.uid()))
  or (
    visibility = 'team_lead'
    and (
      is_team_lead_of(created_by, auth.uid())
      or (same_org(created_by, auth.uid()) and ist_fuehrungsrolle(auth.uid()))
    )
  )
);

drop policy if exists "call_recordings_delete" on call_recordings;
create policy "call_recordings_delete" on call_recordings for delete using (
  created_by = auth.uid()
  or (ist_fuehrungsrolle(auth.uid()) and same_org(created_by, auth.uid()))
);

-- Dieselbe Falle bei den Aufgaben an Terminen: wer eine Aufgabe zugewiesen
-- bekommen oder vergeben hat, muss sie sehen können.
drop policy if exists "lead_tasks_select_all" on lead_tasks;
create policy "lead_tasks_select_all" on lead_tasks for select using (
  assigned_to = auth.uid()
  or assigned_by = auth.uid()
  or exists (select 1 from leads l where l.id = lead_tasks.lead_id)
);

drop policy if exists "lead_tasks_update_involved_or_manager" on lead_tasks;
create policy "lead_tasks_update_involved_or_manager" on lead_tasks for update using (
  assigned_to = auth.uid()
  or assigned_by = auth.uid()
  or (ist_fuehrungsrolle(auth.uid())
      and exists (select 1 from leads l where l.id = lead_tasks.lead_id))
);

drop policy if exists "lead_tasks_delete_own_or_manager" on lead_tasks;
create policy "lead_tasks_delete_own_or_manager" on lead_tasks for delete using (
  assigned_by = auth.uid()
  or (ist_fuehrungsrolle(auth.uid())
      and exists (select 1 from leads l where l.id = lead_tasks.lead_id))
);

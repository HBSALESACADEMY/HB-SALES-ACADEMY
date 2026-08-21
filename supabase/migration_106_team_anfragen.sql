-- Team-Anfragen: nicht mehr nur die anlegende Person darf antworten.
--
-- Die Regeln liessen ausschliesslich is_lead_of_team() zu — also die Person,
-- die das Team erstellt hat. Scheidet sie aus oder ist sie im Urlaub, bleibt
-- eine Beitrittsanfrage unbeantwortet liegen, und niemand kann sie sehen.
--
-- Jetzt wie überall sonst: kann_team_verwalten() — Teamleitung oder eine
-- Führungsrolle derselben Organisation (migration_103/104).
drop policy if exists "team_requests_select_participant" on team_requests;
create policy "team_requests_select_participant" on team_requests for select using (
  auth.uid() = requester_id or kann_team_verwalten(team_id, auth.uid())
);

drop policy if exists "team_requests_update_manager" on team_requests;
create policy "team_requests_update_manager" on team_requests for update using (
  auth.uid() = requester_id or kann_team_verwalten(team_id, auth.uid())
);

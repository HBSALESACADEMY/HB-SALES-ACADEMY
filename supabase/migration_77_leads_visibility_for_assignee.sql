-- Bug: eine Person ohne Manager-Rechte, der auf einem FREMDEN Termin (nicht
-- selbst erstellt) eine Aufgabe zugewiesen oder in einem Kommentar erwähnt
-- wurde, konnte diesen Termin nicht öffnen — die leads_select-Policy kannte
-- nur "selbst erstellt" oder "Manager/Admin der Organisation", keinen Fall
-- für "mir zugewiesen/mich erwähnt". Die Aufgabe erschien zwar korrekt auf
-- dem Dashboard (lead_tasks-Policy erlaubt das bereits), aber der Klick
-- darauf lief ins Leere, weil die Datenbank den zugehörigen Termin gar
-- nicht erst herausgab.
drop policy if exists "leads_select" on leads;
create policy "leads_select" on leads for select using (
  created_by = auth.uid()
  or exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_platform_admin)
  or (
    exists (select 1 from profiles where profiles.id = auth.uid() and (profiles.role = 'manager' or profiles.role = 'backend' or profiles.is_admin))
    and same_org(created_by, auth.uid())
  )
  or exists (select 1 from lead_tasks lt where lt.lead_id = leads.id and lt.assigned_to = auth.uid())
  or exists (select 1 from lead_mentions lm where lm.lead_id = leads.id and lm.user_id = auth.uid())
);

-- Gleicher Grund: sonst wäre der Termin selbst sichtbar, aber der
-- Kommentar-Verlauf (in dem die Zuweisung/Erwähnung oft den Kontext liefert)
-- weiterhin leer.
drop policy if exists "lead_comments_select_all" on lead_comments;
create policy "lead_comments_select_all" on lead_comments for select using (
  exists (
    select 1 from leads l where l.id = lead_comments.lead_id
    and (
      l.created_by = auth.uid()
      or exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_platform_admin)
      or (
        exists (select 1 from profiles where profiles.id = auth.uid() and (profiles.role = 'manager' or profiles.role = 'backend' or profiles.is_admin))
        and same_org(l.created_by, auth.uid())
      )
      or exists (select 1 from lead_tasks lt where lt.lead_id = l.id and lt.assigned_to = auth.uid())
      or exists (select 1 from lead_mentions lm where lm.lead_id = l.id and lm.user_id = auth.uid())
    )
  )
);

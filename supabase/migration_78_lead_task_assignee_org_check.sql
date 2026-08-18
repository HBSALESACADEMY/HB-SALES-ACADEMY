-- KRITISCH: pages/api/lead-task.js übernahm "assignedTo" ungeprüft aus dem
-- Request-Body. Seit migration_77 bekommt die zugewiesene Person automatisch
-- vollen Lesezugriff auf den Termin (leads_select) — ohne diese Prüfung
-- konnte also jede Person mit Zugriff auf einen Termin (Ersteller:in oder
-- Manager) eine BELIEBIGE User-ID einer FREMDEN Organisation als assignedTo
-- eintragen und ihr damit Zugriff auf fremde Kundendaten (Name, Telefon,
-- E-Mail, Notizen, Kommentare) verschaffen. Gleiche Prüfung wie bereits bei
-- @Erwähnungen in lead-comment.js — hier fehlte sie.
drop policy if exists "lead_tasks_insert_own" on lead_tasks;
create policy "lead_tasks_insert_own" on lead_tasks for insert with check (
  auth.uid() = assigned_by
  and exists (
    select 1 from leads l where l.id = lead_tasks.lead_id
    and (
      l.created_by = auth.uid()
      or exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_platform_admin)
      or (
        exists (select 1 from profiles where profiles.id = auth.uid() and (profiles.role = 'manager' or profiles.role = 'backend' or profiles.is_admin))
        and same_org(l.created_by, auth.uid())
      )
    )
    and same_org(l.created_by, assigned_to)
  )
);

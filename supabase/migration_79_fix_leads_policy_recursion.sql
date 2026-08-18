-- KRITISCH — behebt einen Fehler aus migration_77.
--
-- migration_77 hat leads_select um "oder die Person hat hier eine Aufgabe/
-- Erwähnung" erweitert und dafür direkt lead_tasks abgefragt. Die Regel
-- lead_tasks_select_all fragt ihrerseits aber leads ab. Damit prüfen sich
-- beide Regeln gegenseitig endlos:
--     leads → lead_tasks → leads → ...
-- Postgres bricht das mit "infinite recursion detected in policy for
-- relation leads" ab. Folge: Termine liessen sich nicht mehr speichern
-- (der Insert liest den Datensatz danach zurück) und die Termine-Seite
-- blieb leer.
--
-- Lösung ist dasselbe Muster wie bei same_org()/community_post_same_org():
-- eine security-definer-Funktion. Sie läuft mit den Rechten ihres Besitzers
-- und löst deshalb KEINE Regelprüfung auf lead_tasks/lead_mentions aus —
-- die Kette ist unterbrochen.
--
-- Die Funktion nimmt bewusst KEINE Nutzer-ID entgegen, sondern nutzt intern
-- auth.uid(). Sonst könnte man sie mit einer fremden ID aufrufen und so
-- erfahren, ob eine andere Person eine Aufgabe zu einem Termin hat.
create or replace function public.has_lead_task_or_mention(p_lead_id uuid)
returns boolean
language sql stable security definer as $$
  select exists (select 1 from lead_tasks where lead_id = p_lead_id and assigned_to = auth.uid())
      or exists (select 1 from lead_mentions where lead_id = p_lead_id and user_id = auth.uid());
$$;

drop policy if exists "leads_select" on leads;
create policy "leads_select" on leads for select using (
  created_by = auth.uid()
  or exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_platform_admin)
  or (
    exists (select 1 from profiles where profiles.id = auth.uid() and (profiles.role = 'manager' or profiles.role = 'backend' or profiles.is_admin))
    and same_org(created_by, auth.uid())
  )
  or has_lead_task_or_mention(leads.id)
);

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
      or has_lead_task_or_mention(l.id)
    )
  )
);

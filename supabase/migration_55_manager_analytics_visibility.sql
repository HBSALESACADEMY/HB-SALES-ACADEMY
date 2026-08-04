-- Bug: "Login-Verlauf" und "Aktivitäten" (pages/admin/logins.js,
-- pages/admin/activity.js) lassen jeden mit role='manager' auf die Seite,
-- aber die zugrundeliegenden RLS-Policies gaben nur is_admin=true (oder
-- is_platform_admin) organisationsweiten Lesezugriff — ein Manager, der
-- NICHT zusätzlich is_admin ist, sah dadurch fast nichts (nur eigene Team-
-- Mitglieder über is_team_lead_of, falls überhaupt ein Team geleitet wird).
-- Gleiches Muster wie bei call_recordings bereits korrekt gelöst: dort ist
-- profiles.role = 'manager' explizit mit dabei — hier nachgezogen.
drop policy if exists "login_events_select_admin" on login_events;
create policy "login_events_select_admin" on login_events for select using (
  exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_platform_admin)
  or (
    exists (select 1 from profiles where profiles.id = auth.uid() and (profiles.role = 'manager' or profiles.role = 'backend' or profiles.is_admin))
    and same_org(user_id, auth.uid())
  )
);

drop policy if exists "quiz_results_select_admin" on quiz_results;
create policy "quiz_results_select_admin" on quiz_results for select using (
  exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_platform_admin)
  or (
    exists (select 1 from profiles where profiles.id = auth.uid() and (profiles.role = 'manager' or profiles.role = 'backend' or profiles.is_admin))
    and same_org(user_id, auth.uid())
  )
);

drop policy if exists "exam_results_select_admin" on exam_results;
create policy "exam_results_select_admin" on exam_results for select using (
  exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_platform_admin)
  or (
    exists (select 1 from profiles where profiles.id = auth.uid() and (profiles.role = 'manager' or profiles.role = 'backend' or profiles.is_admin))
    and same_org(user_id, auth.uid())
  )
);

drop policy if exists "roleplay_sessions_select_admin" on roleplay_sessions;
create policy "roleplay_sessions_select_admin" on roleplay_sessions for select using (
  exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_platform_admin)
  or (
    exists (select 1 from profiles where profiles.id = auth.uid() and (profiles.role = 'manager' or profiles.role = 'backend' or profiles.is_admin))
    and same_org(user_id, auth.uid())
  )
);

-- Gleicher Bug bei "Insights" (pages/admin/insights.js) — page_views hatte
-- zusätzlich nicht mal is_platform_admin berücksichtigt.
drop policy if exists "page_views_select_admin" on page_views;
create policy "page_views_select_admin" on page_views for select using (
  exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_platform_admin)
  or (
    exists (select 1 from profiles where profiles.id = auth.uid() and (profiles.role = 'manager' or profiles.role = 'backend' or profiles.is_admin))
    and same_org(user_id, auth.uid())
  )
);

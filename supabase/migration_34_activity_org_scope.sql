-- Migration 34: Login-Verlauf & Aktivitäten korrekt nach Organisation trennen.
-- Bisher galt bei login_events/roleplay_sessions "is_admin + same_org" ohne
-- eine Ausnahme für Plattform-Admins (anders als längst bei quiz_results/
-- exam_results, siehe migration_32) — zusammen mit pages/admin/logins.js und
-- pages/admin/activity.js, die bislang komplett UNGEFILTERT über alle
-- Organisationen luden, konnte jeder Organisations-Manager Login- und
-- Aktivitätsdaten FREMDER Firmen sehen. Jetzt: nur Plattform-Admins sehen
-- organisationsübergreifend alles, Organisationsleiter/-Admins nur die
-- eigene Organisation.
-- Einmalig im Supabase SQL Editor ausführen.

drop policy if exists "login_events_select_admin" on login_events;
create policy "login_events_select_admin" on login_events for select using (
  exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_platform_admin)
  or (exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_admin = true) and same_org(user_id, auth.uid()))
);

drop policy if exists "roleplay_sessions_select_admin" on roleplay_sessions;
create policy "roleplay_sessions_select_admin" on roleplay_sessions for select using (
  exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_platform_admin)
  or (exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_admin = true) and same_org(user_id, auth.uid()))
);

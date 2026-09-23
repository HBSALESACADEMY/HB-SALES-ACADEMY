-- Migration 16: Admin-Gesamtübersicht über alle Aktivitäten
-- Einmalig im Supabase SQL Editor ausführen.

-- Admins (is_admin = true) sehen ALLE Mitglieder, nicht nur ihr eigenes Team
-- (im Unterschied zu Managern, die nur ihr zugeordnetes Team sehen).
drop policy if exists "quiz_results_select_admin" on quiz_results;
create policy "quiz_results_select_admin" on quiz_results for select
  using (exists (select 1 from profiles where id = auth.uid() and is_admin = true));

drop policy if exists "exam_results_select_admin" on exam_results;
create policy "exam_results_select_admin" on exam_results for select
  using (exists (select 1 from profiles where id = auth.uid() and is_admin = true));

drop policy if exists "roleplay_sessions_select_admin" on roleplay_sessions;
create policy "roleplay_sessions_select_admin" on roleplay_sessions for select
  using (exists (select 1 from profiles where id = auth.uid() and is_admin = true));

drop policy if exists "login_events_select_admin" on login_events;
create policy "login_events_select_admin" on login_events for select
  using (exists (select 1 from profiles where id = auth.uid() and is_admin = true));

insert into nav_items (key, label, icon, route, is_builtin, requires_manager, order_index) values
  ('admin-activity', 'Aktivitäten', 'lock', '/admin/activity', true, true, 21)
on conflict (key) do nothing;

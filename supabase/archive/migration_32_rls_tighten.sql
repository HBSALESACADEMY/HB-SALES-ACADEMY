-- Migration 32: Sicherheits-Verschärfung — Manager sehen nur ihr eigenes Team
-- Einmalig im Supabase SQL Editor ausführen.
--
-- Bisher konnte JEDER Manager per direkter Datenbank-Abfrage die Anruf- und
-- Login-Daten ALLER Mitglieder sehen (nicht nur des eigenen Teams) — die
-- Oberfläche hat das zwar nie so angezeigt, aber die Regel selbst war zu
-- großzügig. Jetzt: Manager sehen nur ihr Team, Admin-Konten weiterhin alles.

drop policy if exists "call_log_days_select_managers" on call_log_days;
create policy "call_log_days_select_team" on call_log_days for select
  using (
    exists (select 1 from profiles a where a.id = auth.uid() and a.is_admin = true)
    or exists (
      select 1 from profiles me
      where me.id = auth.uid() and me.role = 'manager'
        and (call_log_days.user_id = me.id or call_log_days.user_id in (
          select p.id from profiles p where p.manager_id = me.id
        ))
    )
  );

drop policy if exists "login_events_select_managers" on login_events;
create policy "login_events_select_team" on login_events for select
  using (
    exists (select 1 from profiles a where a.id = auth.uid() and a.is_admin = true)
    or exists (
      select 1 from profiles me
      where me.id = auth.uid() and me.role = 'manager'
        and (login_events.user_id = me.id or login_events.user_id in (
          select p.id from profiles p where p.manager_id = me.id
        ))
    )
  );

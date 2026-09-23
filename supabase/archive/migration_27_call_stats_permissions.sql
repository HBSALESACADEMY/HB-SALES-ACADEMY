-- Migration 27: Anruf-Auswertung: Team-Lead vergibt Sichtbarkeit, kein eigener Menüpunkt mehr
-- Einmalig im Supabase SQL Editor ausführen.

alter table profiles add column if not exists can_view_call_stats boolean not null default false;

-- Alten, jetzt überflüssigen Menüpunkt entfernen (Auswertung sitzt jetzt im Call Tracker selbst).
delete from nav_items where key = 'admin-call-stats';

-- Freigegebene Mitglieder dürfen die Call-Tracker-Daten ihres gesamten Teams lesen
-- (nicht nur ihre eigenen), wenn ihr Team-Lead das erlaubt hat.
create policy "call_log_days_select_permitted_team" on call_log_days for select
  using (
    exists (
      select 1 from profiles me
      where me.id = auth.uid()
        and me.can_view_call_stats = true
        and (call_log_days.user_id = me.manager_id or call_log_days.user_id in (
          select p.id from profiles p where p.manager_id = me.manager_id
        ))
    )
  );

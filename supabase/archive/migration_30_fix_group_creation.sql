-- Migration 30: Fix für zirkuläre RLS-Abhängigkeit bei Gruppen-Erstellung
-- Einmalig im Supabase SQL Editor ausführen.

-- Der Ersteller einer Gruppe darf sie immer sehen, auch bevor die erste
-- Mitgliedschaft eingetragen ist. Ohne das entsteht ein Henne-Ei-Problem:
-- die Mitgliedschaft eintragen zu dürfen, setzte bisher voraus, die Gruppe
-- lesen zu dürfen — was wiederum eine bestehende Mitgliedschaft voraussetzte.
create policy "chat_groups_select_creator" on chat_groups for select
  using (auth.uid() = created_by);

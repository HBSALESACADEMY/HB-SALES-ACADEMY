-- Migration 29: Flashcards-Verwaltung für Manager & Trainer
-- Einmalig im Supabase SQL Editor ausführen.

-- Bisher durften nur Manager Karten anlegen/löschen — Trainer (Rolle für
-- Inhaltsverwaltung ohne Nutzerfreigabe, siehe migration_23) sollen das
-- ebenfalls können, analog zu custom_courses/custom_modules/kb_entries.
drop policy if exists "flashcards_write_managers" on flashcards;
create policy "flashcards_write_managers" on flashcards for insert with check (
  exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role in ('manager', 'trainer'))
);

drop policy if exists "flashcards_delete_managers" on flashcards;
create policy "flashcards_delete_managers" on flashcards for delete using (
  exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role in ('manager', 'trainer'))
  and same_org(created_by, auth.uid())
);

-- Sidebar-Eintrag für die neue Verwaltungsseite (manuell + automatisch per KI).
insert into nav_items (key, label, icon, route, is_builtin, requires_manager, order_index)
values ('admin-flashcards', 'Flashcards verwalten', 'library', '/admin/flashcards', true, true, 14)
on conflict (key) do nothing;

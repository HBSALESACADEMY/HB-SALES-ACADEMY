-- Migration 30: Community-Kategorien für Admins verwaltbar + Sidebar-Reiter
-- "Einwandbehandlung" entfernen.
-- Einmalig im Supabase SQL Editor ausführen.

-- Der eigene Sidebar-Reiter für "Einwandbehandlung" entfällt — die Kategorie
-- bleibt als normale Community-Kategorie bestehen und ist weiterhin über die
-- Kategorie-Pille auf der Community-Seite erreichbar, nur ohne festen
-- Sidebar-Eintrag.
delete from nav_items where key = 'einwandbehandlung';

-- Bisher durften nur Nutzer mit role='manager' Community-Kategorien anlegen/
-- löschen. Jetzt zusätzlich: Trainer (Inhaltsverwaltung) sowie Organisations-
-- und Plattform-Admins (is_admin/is_platform_admin) — das deckt "als Admin
-- möchte ich selbst Kategorien hinzufügen können" ab, auch wenn der Account
-- keine role='manager' trägt.
drop policy if exists "community_groups_write_managers" on community_groups;
create policy "community_groups_write_managers" on community_groups for insert with check (
  exists (
    select 1 from profiles
    where profiles.id = auth.uid()
      and (profiles.role in ('manager', 'trainer') or profiles.is_admin or profiles.is_platform_admin)
  )
);

-- Löschen bleibt auf die eigene Organisation begrenzt — außer für Plattform-
-- Admins, die (wie überall sonst) organisationsübergreifend moderieren dürfen.
drop policy if exists "community_groups_delete_managers" on community_groups;
create policy "community_groups_delete_managers" on community_groups for delete using (
  exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_platform_admin)
  or (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and (profiles.role in ('manager', 'trainer') or profiles.is_admin)
    )
    and same_org(created_by, auth.uid())
  )
);

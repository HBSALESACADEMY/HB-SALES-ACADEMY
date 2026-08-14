-- Die einzelnen Admin-Unterseiten (Aktivitäten, Insights, Login-Verlauf,
-- Inhalte, Flashcards, Lernpfade, Vorschläge, Navigation) waren bisher neun
-- separate Menüpunkte in der Sidebar. Sie sind jetzt über eine gemeinsame
-- Reiterleiste innerhalb des Admin-Bereichs erreichbar (components/AdminTabs.js)
-- statt als eigene Sidebar-Einträge — dort auf "unsichtbar" gesetzt, damit
-- nur noch der eine Einstiegspunkt "Verwaltung" (key='admin') übrig bleibt.
-- Zeilen bleiben erhalten (nur ausgeblendet), falls das je rückgängig gemacht
-- werden soll.
update nav_items set visible = false where key in (
  'admin-suggestions', 'admin-logins', 'admin-insights', 'admin-activity',
  'admin-navigation', 'admin-content', 'admin-flashcards', 'admin-lernpfade'
);

update nav_items set label = 'Verwaltung' where key = 'admin';

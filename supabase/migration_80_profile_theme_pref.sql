-- Die Hell/Dunkel/System-Einstellung lag bisher nur im Browser des jeweiligen
-- Geräts (localStorage). Auf einem zweiten Gerät oder nach dem Leeren der
-- Browserdaten war sie damit weg. Jetzt zusätzlich am Konto gespeichert,
-- sodass sie überall gilt.
-- NULL = nie bewusst gewählt, dann gilt weiterhin die Systemeinstellung.
alter table profiles add column if not exists theme_pref text
  check (theme_pref in ('light', 'dark', 'system'));

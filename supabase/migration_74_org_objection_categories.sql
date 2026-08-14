-- Weißes Label, Fortsetzung: die 6 Einwand-Kategorien im Call Tracker
-- (Preis & Auslastung, Skepsis & Vertrauen, ...) waren fest programmiert.
-- Jede Organisation kann jetzt eigene Kategorien hinterlegen (siehe
-- pages/admin/organization.js) — Array aus {key, label}-Objekten.
-- NULL/leer = die 6 HB-Standardkategorien bleiben aktiv.
alter table organizations add column if not exists objection_categories jsonb;

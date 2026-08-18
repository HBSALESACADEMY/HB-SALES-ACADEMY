-- Weißes Label, Fortsetzung: das Termin-/Lead-Formular (Call Tracker +
-- "Termine" hinzufügen/bearbeiten) hatte fest programmierte Zusatzfelder
-- (Unternehmen, Webseite, Ist Entscheider, Notiz). Jede Organisation kann
-- jetzt eigene Felder definieren (siehe pages/admin/organization.js) —
-- Array aus {key, label, type, multiline?}-Objekten. NULL/leer = die 4
-- HB-Standardfelder bleiben aktiv (siehe lib/leadFields.js).
alter table organizations add column if not exists lead_field_config jsonb;

-- Werte für Felder, die eine Organisation NEU hinzufügt (kein fester
-- Spaltenname wie company/website/is_decision_maker/notes), landen hier.
alter table leads add column if not exists custom_fields jsonb not null default '{}'::jsonb;

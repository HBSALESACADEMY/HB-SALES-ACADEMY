-- Organigramm aus Personen: wer berichtet an wen.
--
-- Die Einheiten aus migration_98 gliedern die Firma in Abteilungen, sagen
-- aber nichts darüber, wer wem zugeordnet ist. Genau das war gewünscht:
-- die Vertriebler unter der eigenen Person einordnen, ohne dass dafür erst
-- ein Team existieren muss.
--
-- Bewusst ein einzelnes Feld auf profiles statt einer eigenen Tabelle: eine
-- Person hat genau eine vorgesetzte Person, mehr braucht ein Organigramm
-- nicht.
alter table profiles add column if not exists vorgesetzter_id uuid references profiles(id) on delete set null;

create index if not exists profiles_vorgesetzter_idx on profiles (vorgesetzter_id);

-- Geschrieben wird ausschliesslich über pages/api/org-supervisor.js: die
-- einzige update-Regel auf profiles erlaubt nur das eigene Profil, und wer
-- unter wem hängt, soll niemand für sich selbst festlegen können.

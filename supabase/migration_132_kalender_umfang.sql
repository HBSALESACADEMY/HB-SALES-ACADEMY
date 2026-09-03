-- Was im Kalender-Abo landet: nur die eigenen Termine oder die des Teams.
--
-- Der Umfang gehört an die Person und NICHT in die Adresse des Links: stünde
-- er dort, hinge jeder nur "&umfang=team" an und bekäme, was ihm nicht
-- zusteht. So bleibt die Entscheidung in der Datenbank, und die Route prüft
-- bei JEDEM Abruf, ob die Rolle das noch hergibt — wer die Teamleitung
-- abgibt, verliert damit auch den erweiterten Kalender, ohne dass jemand
-- daran denken muss.
alter table profiles add column if not exists kalender_umfang text not null default 'eigene';

alter table profiles drop constraint if exists profiles_kalender_umfang_check;
alter table profiles add constraint profiles_kalender_umfang_check
  check (kalender_umfang in ('eigene', 'team'));

comment on column profiles.kalender_umfang is
  'Umfang des Kalender-Abos: eigene Termine oder zusätzlich die der geführten Personen. Die Berechtigung wird bei jedem Abruf neu geprüft.';

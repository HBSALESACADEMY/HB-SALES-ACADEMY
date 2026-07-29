-- Bugfix: Nutzeranfragen (profiles.status = 'pending') tauchten für Manager
-- und Plattform-Admins weder im Sidebar-Badge noch in der "Neue
-- Nutzeranfrage"-Benachrichtigung auf.
--
-- Ursache: can_view_profile() erlaubte nur das eigene Profil oder ein
-- bereits freigegebenes ("approved") Profil zu sehen — der Kommentar über
-- der Funktion behauptet zwar "Mitglieder der eigenen Organisation sind
-- füreinander uneingeschränkt sichtbar", das war aber nie tatsächlich
-- implementiert (kein same_org()-Aufruf). Dadurch blockierte RLS jede
-- Abfrage nach fremden, noch nicht freigegebenen Profilen — auch die des
-- eigenen Managers/Admins in components/Layout.js.
--
-- Fix: same_org() ergänzen, damit Mitglieder derselben Organisation sich
-- gegenseitig unabhängig vom Status sehen können. Die bestehende
-- "jedes freigegebene Profil ist global auffindbar"-Regel (für Community-
-- Suche/Freundschaftsanfragen über Organisationsgrenzen hinweg) bleibt
-- unverändert erhalten.
create or replace function public.can_view_profile(target_id uuid, viewer_id uuid)
returns boolean
language sql stable security definer as $$
  select
    target_id = viewer_id
    or same_org(target_id, viewer_id)
    or exists (select 1 from profiles t where t.id = target_id and t.status = 'approved')
$$;

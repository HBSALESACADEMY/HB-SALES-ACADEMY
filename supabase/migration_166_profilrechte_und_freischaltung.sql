-- Niemand befördert sich selbst — und wer nicht freigeschaltet ist, sieht
-- nichts von der Organisation.
--
-- 1) Geschützte Profilspalten
--
-- Die Regel "profiles_update_own" erlaubt jeder Person, ihre eigene Zeile zu
-- ändern — und zwar JEDE Spalte. Geschützt war bisher nur organization_id
-- (migration_15). Damit genügte eine Zeile in der Browser-Konsole:
--
--   supabase.from("profiles").update({ is_platform_admin: true }).eq("id", ich)
--
-- und ein frisch registriertes, noch nicht freigeschaltetes Konto war
-- Plattform-Admin über alle Organisationen. Dasselbe für Rolle, Status,
-- XP und die übrigen Verwaltungsspalten.
--
-- Diese Spalten schreibt ausschliesslich der Server mit erweiterten Rechten
-- (Freischaltung, Rollen, Vorgesetzte, Kalender-Abo, XP über increment_xp).
-- Dort ist auth.uid() leer — und genau daran erkennt der Trigger, wer
-- schreiben darf. Was eine Person an sich selbst ändert (Name, Bild,
-- Position, Einstellungen, Serie der Tages-Challenge), bleibt frei.

create or replace function public.schuetze_profil_rechte()
returns trigger
language plpgsql as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if new.role is distinct from old.role
     or new.status is distinct from old.status
     or new.is_admin is distinct from old.is_admin
     or new.is_platform_admin is distinct from old.is_platform_admin
     or new.can_view_call_stats is distinct from old.can_view_call_stats
     or new.vorgesetzter_id is distinct from old.vorgesetzter_id
     or new.manager_id is distinct from old.manager_id
     or new.kalender_token is distinct from old.kalender_token
     or new.kalender_umfang is distinct from old.kalender_umfang
     or new.kalender_personen is distinct from old.kalender_personen
     or new.xp is distinct from old.xp
  then
    raise exception 'Diese Angaben im Profil ändert nur die Verwaltung.';
  end if;

  return new;
end;
$$;

drop trigger if exists profile_rechte_schuetzen on profiles;
create trigger profile_rechte_schuetzen
  before update on profiles
  for each row execute function public.schuetze_profil_rechte();

-- 2) Ohne Freischaltung keine Organisation
--
-- Die Sperre für wartende und abgelehnte Konten gab es nur in der
-- Oberfläche (components/Layout.js). Die Zugriffsregeln der Datenbank
-- kannten sie nicht: Wer einen Firmencode hatte und sich registrierte,
-- konnte an der Oberfläche vorbei schon vor der Freischaltung Termine,
-- Kontakte und Zahlen der Organisation lesen. Ein abgelehntes Konto
-- ebenso.
--
-- aktive_org ist die Stelle, an der fast alle Regeln die Organisation der
-- anfragenden Person nachschlagen (direkt, über sieht_person, same_org und
-- can_view_profile). Ohne Freischaltung liefert sie jetzt nichts — die
-- eigenen Zeilen bleiben sichtbar, weil deren Regeln auf "= auth.uid()"
-- prüfen und keine Organisation brauchen.

create or replace function public.ist_freigeschaltet(uid uuid)
returns boolean
language sql stable security definer as $$
  select coalesce(
    (select status = 'approved' or coalesce(is_platform_admin, false) from profiles where id = uid),
    false);
$$;

create or replace function public.aktive_org(uid uuid)
returns uuid
language sql stable security definer as $$
  select case
    when not public.ist_freigeschaltet(uid) then null
    when coalesce((select is_platform_admin from profiles where id = uid), false)
      then coalesce(
        (select organization_id from active_org where user_id = uid),
        (select organization_id from profiles where id = uid))
    else (select organization_id from profiles where id = uid)
  end;
$$;

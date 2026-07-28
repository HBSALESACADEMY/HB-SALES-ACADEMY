-- Migration 21: Fix für fehlschlagende Registrierung ("Database error saving
-- new user" bei jedem Signup, trotz gültigem Firmencode).
-- Einmalig im Supabase SQL Editor ausführen.
--
-- Ursache: handle_new_user() griff mit "from organizations" (ohne Schema-
-- Präfix) zu. Im SQL Editor (Rolle "postgres") funktioniert das, weil deren
-- search_path automatisch "public" enthält — der echte Registrierungs-Dienst
-- von Supabase Auth verbindet sich aber als eigene, enger eingeschränkte
-- Datenbank-Rolle (supabase_auth_admin), deren search_path "public" NICHT
-- enthält. Die Tabelle war für diese Rolle deshalb "nicht auffindbar", was
-- die ganze Registrierung mit einem Fremdschlüssel-/Transaktionsfehler
-- abbrechen ließ. Fix: Tabellen explizit mit "public." qualifizieren und
-- den search_path der Funktion zusätzlich fest auf "public" setzen.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare org_id uuid;
begin
  select id into org_id from public.organizations where slug = new.raw_user_meta_data->>'org_slug';
  if org_id is null then
    raise exception 'Unbekannter Firmen-Code.';
  end if;
  insert into public.profiles (id, full_name, organization_id)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''), org_id);
  return new;
end;
$$;

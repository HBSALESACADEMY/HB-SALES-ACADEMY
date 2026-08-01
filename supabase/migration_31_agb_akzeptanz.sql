-- Migration 31: AGB-Zustimmung bei der Registrierung nachweisbar speichern.
-- Einmalig im Supabase SQL Editor ausführen.
--
-- Nutzt bei dieser Gelegenheit die Chance, handle_new_user() auch gleich mit
-- dem search_path-Fix aus migration_21 neu zu schreiben — schema_v2.sql war
-- seit migration_21 nicht mehr synchron (die Funktion dort hatte immer noch
-- den unqualifizierten "from organizations"-Zugriff ohne search_path-Fix).

alter table profiles add column if not exists agb_accepted_at timestamptz;

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
  insert into public.profiles (id, full_name, organization_id, agb_accepted_at)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    org_id,
    -- Nur gesetzt, wenn die Checkbox im Registrierungsformular tatsächlich
    -- aktiviert war (siehe pages/login.js) — bei admin-angelegten Accounts
    -- (z.B. neuer Organisations-Manager) bleibt das Feld bewusst leer, weil
    -- dort niemand persönlich zugestimmt hat.
    case when (new.raw_user_meta_data->>'agb_accepted')::boolean is true then now() else null end
  );
  return new;
end;
$$;

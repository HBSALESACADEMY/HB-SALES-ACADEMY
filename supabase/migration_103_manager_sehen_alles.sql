-- Führungsrollen sehen die Daten ALLER Teams ihrer Organisation.
--
-- Bisher sah ein Manager nur, was an ihm selbst hing: Mentoring-Paare nur
-- die von ihm zugewiesenen, Anruf-Zahlen nur von Teams, die er selbst
-- leitet. Teams von Kolleg:innen blieben leer — was den Überblick, den die
-- Seite verspricht, zunichtemachte.
--
-- Sehen heisst weiterhin nicht ändern: Mitglieder, Ziele und Zuweisungen
-- bleiben der Leitung des jeweiligen Teams und den Admins vorbehalten
-- (migration_88).
--
-- Die Mandanten-Grenze bleibt: sieht_person() vergleicht gegen die AKTIVE
-- Organisation (migration_92), nicht gegen die Heimat des Kontos.
create or replace function public.ist_fuehrungsrolle(uid uuid)
returns boolean
language sql stable security definer as $$
  select exists (
    select 1 from profiles
    where id = uid and (role = 'manager' or role = 'backend' or is_admin or is_platform_admin)
  );
$$;

-- --- Mentoring-Paare ---
drop policy if exists "mentor_pairs_select_participant" on mentor_pairs;
create policy "mentor_pairs_select_participant" on mentor_pairs for select using (
  auth.uid() = mentor_id or auth.uid() = mentee_id or auth.uid() = manager_id
  or (ist_fuehrungsrolle(auth.uid()) and sieht_person(mentee_id))
);

-- Auflösen darf auch, wer das Paar nicht selbst angelegt hat — sonst bleibt
-- ein Paar für immer bestehen, wenn die zuweisende Person ausscheidet.
drop policy if exists "mentor_pairs_update_manager" on mentor_pairs;
create policy "mentor_pairs_update_manager" on mentor_pairs for update using (
  auth.uid() = manager_id
  or (ist_fuehrungsrolle(auth.uid()) and sieht_person(mentee_id))
);

-- --- Anruf-Zahlen ---
drop policy if exists "call_log_days_select_managers" on call_log_days;
create policy "call_log_days_select_managers" on call_log_days for select using (
  sieht_person(user_id)
  and (
    is_team_lead_of(user_id, auth.uid())
    or ist_fuehrungsrolle(auth.uid())
  )
);

-- --- Verwalten gleichzieht mit Sehen ---
-- migration_88 erlaubte das Verwalten eines Teams nur der anlegenden Person
-- und Admins — bewusst, damit nicht jeder Manager in fremden Teams aufräumt.
-- In der Praxis heisst das aber: Ein Manager sieht das Team seiner Kollegin,
-- kann dort aber kein Ziel korrigieren, keine Mitglieder zuordnen, nichts.
--
-- Neu darf jede Führungsrolle die Teams IHRER Organisation verwalten. Das
-- ist eine bewusste Lockerung: ein Manager kann damit auch ein Team
-- verändern, das jemand anderes aufgebaut hat.
create or replace function public.kann_team_verwalten(tid uuid, uid uuid)
returns boolean
language sql stable security definer as $$
  select exists (
    select 1
    from teams t
    where t.id = tid
      and (
        t.created_by = uid
        or (ist_fuehrungsrolle(uid) and t.organization_id is not distinct from aktive_org(uid))
      )
  );
$$;

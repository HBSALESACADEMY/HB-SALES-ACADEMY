-- Der Rückruf nach der Mail.
--
-- "Ich schicke Ihnen was" ist erst die halbe Arbeit. Die zweite Hälfte ist
-- der Anruf drei Tage später — und genau der geht unter, weil er nirgends
-- steht. Eine verschickte Mail ist kein Termin, deshalb taucht sie in
-- keinem Kalender auf, und im Kopf behält ihn niemand über zwanzig
-- Kontakte hinweg.
--
-- Bewusst eine eigene Tabelle und kein Termin in leads: ein Nachfassen ist
-- kein Verkaufsgespräch. Stünde es dort, zählte jede Mail als Erstgespräch,
-- und die Stufen-Auswertung — für die der Unterschied zwischen den Stufen
-- der ganze Sinn ist — wäre wertlos.
create table if not exists nachfass_termine (
  id uuid primary key default gen_random_uuid(),

  -- Die Organisation, in der gearbeitet wurde — nicht die Heimat des
  -- Kontos (vgl. migration_114).
  organization_id uuid references organizations(id) on delete cascade,

  -- Wer sich kümmert. In DESSEN Kalender steht der Eintrag, und DIESE
  -- Person wird erinnert. Getrennt von erstellt_von, weil die Leitung ein
  -- Nachfassen zuweisen können soll, ohne es selbst zu erben.
  zustaendig uuid not null references profiles(id) on delete cascade,
  erstellt_von uuid not null references profiles(id) on delete cascade,

  -- Woraus es entstanden ist. Beides darf leer sein: ein Nachfassen kann
  -- auch für sich stehen.
  kontakt_id uuid references email_kontakte(id) on delete cascade,
  lead_id uuid references leads(id) on delete set null,

  titel text not null,
  notiz text,

  -- Wann. Mit Uhrzeit, denn der Eintrag geht in einen Kalender, und ein
  -- Kalendereintrag ohne Uhrzeit landet als Ganztagesbalken über allem.
  faellig_am timestamptz not null,

  erledigt_am timestamptz,
  -- Einmal erinnern, nicht täglich: eine Erinnerung, die jeden Morgen
  -- erneut kommt, liest nach drei Tagen niemand mehr (vgl.
  -- lib/nachfassErinnerung.js).
  erinnert_am timestamptz,

  created_at timestamptz not null default now()
);

create index if not exists nachfass_zustaendig_idx on nachfass_termine (zustaendig, faellig_am);
create index if not exists nachfass_org_idx on nachfass_termine (organization_id, faellig_am);
create index if not exists nachfass_kontakt_idx on nachfass_termine (kontakt_id);

alter table nachfass_termine enable row level security;

-- Eigene Zeilen ohne jede Zusatzbedingung.
--
-- Diese Falle hat in diesem Projekt schon dreimal zugeschlagen — Duelle,
-- Aufnahmen, E-Mail-Kontakte: neben "= auth.uid()" stand zusätzlich eine
-- Organisationsbedingung, und wer unter einem fremden Firmencode arbeitete,
-- kam an seine eigenen Zeilen nicht mehr heran. Hier steht sie nicht.
drop policy if exists "nachfass_termine_select_own" on nachfass_termine;
create policy "nachfass_termine_select_own" on nachfass_termine for select using (
  auth.uid() = zustaendig or auth.uid() = erstellt_von
);

drop policy if exists "nachfass_termine_update_own" on nachfass_termine;
create policy "nachfass_termine_update_own" on nachfass_termine for update using (
  auth.uid() = zustaendig or auth.uid() = erstellt_von
);

drop policy if exists "nachfass_termine_delete_own" on nachfass_termine;
create policy "nachfass_termine_delete_own" on nachfass_termine for delete using (
  auth.uid() = zustaendig or auth.uid() = erstellt_von
);

-- Anlegen: für sich selbst immer. Für jemand anderen nur, wenn man diese
-- Person auch führt — dieselbe Grenze wie beim Folgetermin (migration_130).
-- Sonst schöbe man einer beliebigen Person Arbeit in den Kalender.
drop policy if exists "nachfass_termine_insert" on nachfass_termine;
create policy "nachfass_termine_insert" on nachfass_termine for insert with check (
  -- Die Mandanten-Grenze steht wie überall VOR allen anderen Gründen.
  (organization_id is null or organization_id is not distinct from aktive_org(auth.uid()))
  and erstellt_von = auth.uid()
  and (
    zustaendig = auth.uid()
    or (
      sieht_person(zustaendig)
      and (ist_fuehrungsrolle(auth.uid()) or is_team_lead_of(zustaendig, auth.uid()))
    )
  )
);

-- Die Leitung sieht und ändert, was in ihrer Organisation liegt — an die
-- Mandanten-Grenze gebunden.
drop policy if exists "nachfass_termine_select_leitung" on nachfass_termine;
create policy "nachfass_termine_select_leitung" on nachfass_termine for select using (
  sieht_person(zustaendig)
  and (ist_fuehrungsrolle(auth.uid()) or is_team_lead_of(zustaendig, auth.uid()))
);

drop policy if exists "nachfass_termine_update_leitung" on nachfass_termine;
create policy "nachfass_termine_update_leitung" on nachfass_termine for update using (
  sieht_person(zustaendig)
  and (ist_fuehrungsrolle(auth.uid()) or is_team_lead_of(zustaendig, auth.uid()))
);

drop policy if exists "nachfass_termine_delete_leitung" on nachfass_termine;
create policy "nachfass_termine_delete_leitung" on nachfass_termine for delete using (
  sieht_person(zustaendig)
  and (ist_fuehrungsrolle(auth.uid()) or is_team_lead_of(zustaendig, auth.uid()))
);

comment on table nachfass_termine is
  'Rückruf nach einer Mail: steht im Kalender der zuständigen Person und wird erinnert. Kein Verkaufsgespräch — deshalb nicht in leads.';

-- Firmenkalender und vollständige Profile.
--
-- Bisher gab es nur Vertriebstermine. Was eine Firma sonst im Kalender hat —
-- Schulungen, Messen, Feiertage, Betriebsausflug — hatte keinen Ort. Und
-- Geburtstage waren nirgends hinterlegt, obwohl sie das Erste sind, was ein
-- Team voneinander wissen will.
alter table profiles add column if not exists geburtstag date;

-- Ob das Profil eingerichtet wurde. Neue Konten müssen das nachholen, bevor
-- sie loslegen — sonst entstehen Karteileichen ohne Namen, die im
-- Organigramm und in der Mitgliederliste als "Unbenannt" stehen.
alter table profiles add column if not exists profil_vollstaendig boolean not null default false;

-- Bestehende Konten gelten als eingerichtet, sofern sie einen Namen haben —
-- niemand soll nach einem Update plötzlich ausgesperrt werden.
update profiles set profil_vollstaendig = true
where profil_vollstaendig = false and coalesce(nullif(trim(full_name), ''), null) is not null;

create table if not exists org_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  created_by uuid not null references profiles(id) on delete cascade,
  titel text not null,
  beschreibung text,
  von date not null,
  bis date,
  uhrzeit text,
  art text not null default 'sonstiges' check (art in ('schulung', 'meeting', 'messe', 'feiertag', 'urlaub', 'sonstiges')),
  created_at timestamptz not null default now()
);

create index if not exists org_events_zeitraum_idx on org_events (organization_id, von);

alter table org_events enable row level security;

-- Lesen: alle der aktiven Organisation. Ein Firmenkalender, den nur die
-- Leitung sieht, ist keiner.
drop policy if exists "org_events_select" on org_events;
create policy "org_events_select" on org_events for select using (
  organization_id is not distinct from aktive_org(auth.uid())
);

-- Eintragen darf jede Person ihrer eigenen Organisation.
drop policy if exists "org_events_insert" on org_events;
create policy "org_events_insert" on org_events for insert with check (
  created_by = auth.uid()
  and organization_id is not distinct from aktive_org(auth.uid())
);

-- Ändern und löschen: der eigene Eintrag, oder eine Führungsrolle — sonst
-- bleibt ein falscher Termin stehen, wenn die eintragende Person weg ist.
drop policy if exists "org_events_update" on org_events;
create policy "org_events_update" on org_events for update using (
  created_by = auth.uid()
  or (ist_fuehrungsrolle(auth.uid()) and organization_id is not distinct from aktive_org(auth.uid()))
);

drop policy if exists "org_events_delete" on org_events;
create policy "org_events_delete" on org_events for delete using (
  created_by = auth.uid()
  or (ist_fuehrungsrolle(auth.uid()) and organization_id is not distinct from aktive_org(auth.uid()))
);

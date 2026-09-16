-- Onboarding: ein Plan aus Schritten je Organisation, der neuen Leuten
-- zugewiesen wird — mit Fortschritt, Fälligkeit und Schritten, die sich
-- selbst abhaken.
--
-- Geschrieben wird ausschliesslich über den Server
-- (pages/api/onboarding.js). Dort steht, wer was darf: Die Leitung verwaltet
-- Plan und Zuweisungen, ein Vertriebler hakt nur seine eigenen Schritte ab,
-- und automatische Schritte hakt niemand von Hand. Diese Regeln in
-- Zugriffsregeln der Datenbank nachzubauen, hiesse sie zweimal zu pflegen.
-- Lesen dürfen Browser nur, was sie ohnehin sehen sollen.

create table if not exists onboarding_schritte (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  titel text not null,
  beschreibung text,
  reihenfolge integer not null default 0,
  -- Bis wann, gezählt in Tagen ab dem Start (0 = Starttag). Leer: ohne Frist.
  faellig_tag integer check (faellig_tag is null or (faellig_tag >= 0 and faellig_tag <= 365)),
  -- Wer von Hand abhakt. Bei automatischen Schritten ohne Bedeutung.
  wer text not null default 'vertrieb' check (wer in ('vertrieb', 'leitung')),
  -- Woran die Academy selbst erkennt, dass der Schritt erledigt ist.
  automatisch text check (automatisch is null or automatisch in
    ('profil', 'telegram', 'quiz', 'pruefung', 'rollenspiel', 'anwahlen', 'termine', 'kunden', 'mails')),
  ziel_anzahl integer check (ziel_anzahl is null or ziel_anzahl > 0),
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists onboarding_schritte_org_idx on onboarding_schritte (organization_id, reihenfolge);

create table if not exists onboarding_zuweisungen (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  gestartet_am date not null,
  zugewiesen_von uuid references profiles(id) on delete set null,
  abgeschlossen_am timestamptz,
  -- Woran schon erinnert wurde (Schritt-ID → Tag) — jede Erinnerung einmal.
  erinnert jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

create table if not exists onboarding_haken (
  zuweisung_id uuid not null references onboarding_zuweisungen(id) on delete cascade,
  schritt_id uuid not null references onboarding_schritte(id) on delete cascade,
  erledigt_am timestamptz not null default now(),
  erledigt_von uuid references profiles(id) on delete set null,
  primary key (zuweisung_id, schritt_id)
);

alter table onboarding_schritte enable row level security;
alter table onboarding_zuweisungen enable row level security;
alter table onboarding_haken enable row level security;

-- Den Plan sieht die eigene Organisation.
drop policy if exists "onboarding_schritte_lesen" on onboarding_schritte;
create policy "onboarding_schritte_lesen" on onboarding_schritte
  for select using (organization_id = aktive_org(auth.uid()));

-- Die eigene Zuweisung — ohne Bedingung an die Organisation, wie bei allen
-- eigenen Zeilen.
drop policy if exists "onboarding_zuweisung_eigene" on onboarding_zuweisungen;
create policy "onboarding_zuweisung_eigene" on onboarding_zuweisungen
  for select using (user_id = auth.uid());

drop policy if exists "onboarding_zuweisung_leitung" on onboarding_zuweisungen;
create policy "onboarding_zuweisung_leitung" on onboarding_zuweisungen
  for select using (ist_fuehrungsrolle(auth.uid()) and organization_id = aktive_org(auth.uid()));

drop policy if exists "onboarding_haken_lesen" on onboarding_haken;
create policy "onboarding_haken_lesen" on onboarding_haken
  for select using (exists (
    select 1 from onboarding_zuweisungen z
    where z.id = onboarding_haken.zuweisung_id
      and (z.user_id = auth.uid()
           or (ist_fuehrungsrolle(auth.uid()) and z.organization_id = aktive_org(auth.uid())))
  ));

-- Der Menüpunkt, nur für die Leitung.
insert into nav_items (key, label, icon, route, is_builtin, requires_manager, visible, order_index)
values ('onboarding', 'Onboarding', 'check', '/onboarding', true, true, true,
        coalesce((select order_index from nav_items where key = 'auswertung'), 30) + 1)
on conflict (key) do update
  set label = excluded.label, icon = excluded.icon, route = excluded.route,
      visible = true, requires_manager = true;

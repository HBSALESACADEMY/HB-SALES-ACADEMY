-- Einladungen zu Terminen — für Kalender-Einträge und für Vertriebstermine.
--
-- Eine Einladung ist keine Zuweisung: sie muss angenommen werden. Deshalb
-- der Status, und deshalb darf ihn nur die eingeladene Person selbst setzen.
-- Wer einlädt, kann die Einladung zurückziehen, aber nicht für die andere
-- Person zusagen.
--
-- Eine Tabelle für beide Arten von Terminen (quelle), weil sich sonst
-- dieselbe Regel an zwei Stellen wiederholt und mit der Zeit auseinander
-- läuft. ziel_id trägt bewusst KEINEN Fremdschlüssel: sie zeigt je nach
-- quelle auf org_events oder auf leads.
create table if not exists termin_einladungen (
  id uuid primary key default gen_random_uuid(),
  quelle text not null check (quelle in ('org_event', 'lead')),
  ziel_id uuid not null,
  person_id uuid not null references profiles(id) on delete cascade,
  eingeladen_von uuid not null references profiles(id) on delete cascade,
  status text not null default 'offen' check (status in ('offen', 'zugesagt', 'abgesagt')),
  -- Explizit gesetzt statt abgeleitet: die Mandanten-Grenze soll auch dann
  -- halten, wenn ein Konto später die Organisation wechselt (migration_53).
  organization_id uuid references organizations(id) on delete cascade,
  beantwortet_am timestamptz,
  created_at timestamptz not null default now(),
  -- Zweimal dieselbe Person zum selben Termin einzuladen ergibt nichts.
  unique (quelle, ziel_id, person_id)
);

create index if not exists termin_einladungen_ziel_idx on termin_einladungen (quelle, ziel_id);
create index if not exists termin_einladungen_person_idx on termin_einladungen (person_id, status);

alter table termin_einladungen enable row level security;

-- Lesen: die eigene Einladung, die selbst ausgesprochene, und alle
-- Einladungen zu Terminen der eigenen Organisation — sonst sähe niemand,
-- wer zugesagt hat.
drop policy if exists "termin_einladungen_select" on termin_einladungen;
create policy "termin_einladungen_select" on termin_einladungen for select using (
  person_id = auth.uid()
  or eingeladen_von = auth.uid()
  or sieht_person(person_id)
);

-- Einladen darf man nur Menschen der eigenen aktiven Organisation, und nur
-- in eigenem Namen.
drop policy if exists "termin_einladungen_insert" on termin_einladungen;
create policy "termin_einladungen_insert" on termin_einladungen for insert with check (
  eingeladen_von = auth.uid()
  and sieht_person(person_id)
  and organization_id is not distinct from aktive_org(auth.uid())
);

-- Annehmen oder ablehnen darf ausschliesslich die eingeladene Person.
drop policy if exists "termin_einladungen_update" on termin_einladungen;
create policy "termin_einladungen_update" on termin_einladungen for update using (
  person_id = auth.uid()
) with check (
  person_id = auth.uid()
);

-- Zurückziehen darf, wer eingeladen hat; wegräumen darf man auch die
-- eigene Einladung.
drop policy if exists "termin_einladungen_delete" on termin_einladungen;
create policy "termin_einladungen_delete" on termin_einladungen for delete using (
  eingeladen_von = auth.uid()
  or person_id = auth.uid()
  or (ist_fuehrungsrolle(auth.uid()) and sieht_person(person_id))
);

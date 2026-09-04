-- Kontakte, die im Gespräch um eine E-Mail gebeten haben.
--
-- "Schicken Sie mir mal was" ist kein gescheiterter Anruf und kein Termin,
-- sondern ein offener Faden: jemand hat Interesse gezeigt, und jetzt muss
-- jemand anderes etwas tun. Genau deshalb eine eigene Tabelle und nicht ein
-- weiterer Ablehnungsgrund — als Grund gezählt, gälte der Anruf in jeder
-- Statistik als verloren.
create table if not exists email_kontakte (
  id uuid primary key default gen_random_uuid(),
  -- Die Organisation, in der telefoniert wurde — nicht die Heimat des
  -- Kontos (vgl. migration_114).
  organization_id uuid references organizations(id) on delete cascade,
  -- Wer den Kontakt erarbeitet hat. Bleibt auch dann stehen, wenn jemand
  -- anderes die Mail verschickt: der Termin, der daraus entsteht, gehört
  -- dieser Person.
  user_id uuid not null references profiles(id) on delete cascade,

  name text not null,
  email text not null,
  firma text,
  telefon text,
  -- Worum es im Gespräch ging. Ohne sie schreibt der Marketing-Mensch eine
  -- Mail ins Blaue und der Kontakt merkt es sofort.
  notiz text,

  status text not null default 'offen'
    check (status in ('offen', 'verschickt', 'termin', 'keine_antwort', 'kein_interesse')),
  verschickt_am timestamptz,
  verschickt_von uuid references profiles(id) on delete set null,
  -- Wurde ein Termin daraus, zeigt das auf den echten Termin. Sonst hätte
  -- man zwei Systeme mit Terminen, die nie zusammenkommen.
  lead_id uuid references leads(id) on delete set null,
  ergebnis_am timestamptz,

  created_at timestamptz not null default now()
);

create index if not exists email_kontakte_org_idx on email_kontakte (organization_id, status, created_at desc);
create index if not exists email_kontakte_user_idx on email_kontakte (user_id, created_at desc);
-- Für die Dublettenprüfung beim Eintippen.
create index if not exists email_kontakte_email_idx on email_kontakte (organization_id, lower(email));

alter table email_kontakte enable row level security;

-- Eigene Zeilen ohne jede Zusatzbedingung — die Regel, die schon zweimal
-- Leute aus ihren eigenen Daten ausgesperrt hat.
drop policy if exists "email_kontakte_select_own" on email_kontakte;
create policy "email_kontakte_select_own" on email_kontakte for select using (auth.uid() = user_id);

drop policy if exists "email_kontakte_insert_own" on email_kontakte;
create policy "email_kontakte_insert_own" on email_kontakte for insert with check (auth.uid() = user_id);

-- Führung sieht und bearbeitet die Kontakte ihrer Organisation. Das
-- Bearbeiten ist der eigentliche Zweck: abhaken, Ergebnis eintragen.
drop policy if exists "email_kontakte_select_leitung" on email_kontakte;
create policy "email_kontakte_select_leitung" on email_kontakte for select using (
  ist_fuehrungsrolle(auth.uid()) and sieht_person(user_id)
);

drop policy if exists "email_kontakte_update_leitung" on email_kontakte;
create policy "email_kontakte_update_leitung" on email_kontakte for update using (
  ist_fuehrungsrolle(auth.uid()) and sieht_person(user_id)
);

drop policy if exists "email_kontakte_delete_leitung" on email_kontakte;
create policy "email_kontakte_delete_leitung" on email_kontakte for delete using (
  ist_fuehrungsrolle(auth.uid()) and sieht_person(user_id)
);

-- Navigationspunkt. requires_manager: der Reiter ist Führungsstoff, die
-- Vertriebler erfassen ihre Kontakte im Call Tracker.
insert into nav_items (key, label, icon, route, is_builtin, requires_manager, visible, order_index)
values ('email-marketing', 'E-Mail Marketing', 'send', '/email-marketing', true, true, true,
        coalesce((select order_index from nav_items where key = 'auswertung'), 59) + 1)
on conflict (key) do update
  set label = excluded.label, icon = excluded.icon, route = excluded.route,
      visible = true, requires_manager = true;

-- Auf "E-Mail gewünscht" lässt sich auch ein Ziel setzen. Ohne diese
-- Erweiterung lehnt die Datenbank jedes solche Ziel ab — die erlaubten
-- Kennzahlen stehen hier und in lib/goalMetrics.js, und ein Test hält beide
-- Listen zusammen.
alter table team_goals drop constraint if exists team_goals_metric_check;
alter table team_goals add constraint team_goals_metric_check check (metric in (
  'roleplay', 'quiz', 'daily_challenge',
  'anwahlen', 'erreicht', 'nicht', 'termin', 'negativ',
  'gatekeeper', 'entscheider', 'weitergeleitet', 'email',
  'termine', 'kunden', 'absagen', 'wahrgenommen'
));

alter table organizations drop constraint if exists organizations_team_ranking_metric_check;
alter table organizations add constraint organizations_team_ranking_metric_check check (
  team_ranking_metric is null or team_ranking_metric in (
    'xp',
    'roleplay', 'quiz', 'daily_challenge',
    'anwahlen', 'erreicht', 'nicht', 'termin', 'negativ',
    'gatekeeper', 'entscheider', 'weitergeleitet', 'email',
    'termine', 'kunden', 'absagen', 'wahrgenommen'
  )
);

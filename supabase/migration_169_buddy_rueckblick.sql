-- Das Gedächtnis des Vertriebsbuddys — und was die Leitung davon sieht.
--
-- Am Ende jeder Woche fasst die Academy das Gespräch zu einem kurzen
-- Rückblick zusammen: woran es hakte, wie die Stimmung war, was sich die
-- Person vorgenommen hat. Der Impuls der nächsten Woche knüpft daran an.
--
-- WICHTIG, und zwar als Entscheidung und nicht als Nebensache: Die
-- Leitung bekommt NIE die Sätze aus dem Chat zu sehen. Sie sieht die
-- herausgelesenen Herausforderungen und die Stimmung — mehr nicht. Wer
-- fürchten muss, dass sein "diese Woche war zäh" der Leitung wortwörtlich
-- vorgelegt wird, schreibt beim nächsten Mal nichts mehr, und dann ist der
-- Buddy wertlos.
--
-- Technisch sichert das die Zeile unten: Es gibt KEINE Leseregel für die
-- Leitung. Weder auf buddy_nachrichten noch auf buddy_wochen. Was die
-- Leitung sieht, stellt allein der Server zusammen
-- (pages/api/herausforderungen.js) — und der gibt die Zusammenfassung des
-- Gesprächs nicht heraus.

create table if not exists buddy_wochen (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  organization_id uuid references organizations(id) on delete set null,
  -- Der Montag der Woche, um die es geht.
  woche date not null,
  -- Kurze Stichpunkte, aus dem Gespräch herausgelesen.
  herausforderungen jsonb not null default '[]'::jsonb,
  stimmung text check (stimmung is null or stimmung in ('gut', 'gemischt', 'schwer')),
  vorhaben text,
  -- Nur für den Buddy selbst, damit er nächste Woche anknüpfen kann.
  -- Verlässt den Server nie in Richtung Leitung.
  zusammenfassung text,
  created_at timestamptz not null default now(),
  unique (user_id, woche)
);
create index if not exists buddy_wochen_org_idx on buddy_wochen (organization_id, woche desc);

alter table buddy_wochen enable row level security;

-- Nur die eigene Zeile. Die Leitung liest hier nichts direkt.
drop policy if exists "buddy_wochen_eigene" on buddy_wochen;
create policy "buddy_wochen_eigene" on buddy_wochen
  for select using (user_id = auth.uid());

-- Der Menüpunkt für die Leitung.
insert into nav_items (key, label, icon, route, is_builtin, requires_manager, visible, order_index)
values ('herausforderungen', 'Herausforderungen', 'flame', '/herausforderungen', true, true, true,
        coalesce((select order_index from nav_items where key = 'onboarding'), 31) + 1)
on conflict (key) do update
  set label = excluded.label, icon = excluded.icon, route = excluded.route,
      visible = true, requires_manager = true;

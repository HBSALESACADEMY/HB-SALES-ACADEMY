-- Merkt sich den zuletzt geprüften Systemzustand.
--
-- Zweck: Alarm nur beim WECHSEL melden (heil -> gestört und zurück), nicht
-- bei jeder Prüfung — sonst kommt bei einer längeren Störung stündlich
-- dieselbe Nachricht und man schaut irgendwann nicht mehr hin.
--
-- Nur eine Zeile (id = true). Kein RLS für Angemeldete: die Tabelle wird
-- ausschliesslich vom Server geschrieben und gelesen.
create table if not exists system_health (
  id boolean primary key default true check (id),
  gesund boolean not null,
  pruefungen jsonb not null,
  geprueft_at timestamptz not null default now()
);

alter table system_health enable row level security;

-- Plattform-Admins dürfen den Zustand sehen (Status-Anzeige in der
-- Verwaltung). Geschrieben wird nur serverseitig.
drop policy if exists "system_health_select_platform_admin" on system_health;
create policy "system_health_select_platform_admin" on system_health for select using (
  exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_platform_admin)
);

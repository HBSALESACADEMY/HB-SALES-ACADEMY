-- Die Mini-Schulungen des Vertriebsbuddys.
--
-- Aus einem Rat wird ein Ablauf: Lektion, am nächsten Tag die Übung, am
-- Freitag das Fazit. Hier steht nur, WELCHES Thema wann läuft — die
-- Bausteine selbst stehen im Code (lib/schulung.js), damit kein halber
-- Einstiegssatz aus einer Sprach-KI am Telefon landet.
--
-- Gelesen wird wieder nur die eigene Zeile. Die Leitung sieht über die
-- Route (pages/api/herausforderungen.js) das Thema und ob die Übung
-- gemacht wurde — nie den Chat.

create table if not exists buddy_schulungen (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  organization_id uuid references organizations(id) on delete set null,
  -- Der Schlüssel aus lib/schulung.js, etwa 'vorzimmer'.
  thema text not null,
  -- 'gestartet' = Lektion raus, 'uebung' = Übung raus, 'fertig' = Woche vorbei.
  phase text not null default 'gestartet' check (phase in ('gestartet', 'uebung', 'fertig')),
  woche date not null,
  gestartet_am date not null,
  uebung_am date,
  -- Ob die Übung gemacht wurde. Bleibt leer, wenn es sich aus dem Gespräch
  -- nicht sagen lässt — geraten wird hier nichts.
  erledigt boolean,
  created_at timestamptz not null default now()
);
create index if not exists buddy_schulungen_person_idx on buddy_schulungen (user_id, woche desc);
create index if not exists buddy_schulungen_org_idx on buddy_schulungen (organization_id, woche desc);

alter table buddy_schulungen enable row level security;

drop policy if exists "buddy_schulungen_eigene" on buddy_schulungen;
create policy "buddy_schulungen_eigene" on buddy_schulungen
  for select using (user_id = auth.uid());

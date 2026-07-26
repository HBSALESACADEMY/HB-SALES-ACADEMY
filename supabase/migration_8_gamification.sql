-- Migration 8: Tages-Challenge, Flashcards, Quiz-Duelle
-- Einmalig im Supabase SQL Editor ausführen.

-- Tages-Challenge / Streak
alter table profiles add column if not exists streak_count integer not null default 0;
alter table profiles add column if not exists last_challenge_date date;

create table if not exists daily_challenge_completions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  challenge_date date not null,
  correct boolean not null,
  created_at timestamptz not null default now(),
  unique (user_id, challenge_date)
);
alter table daily_challenge_completions enable row level security;
create policy "dcc_select_own" on daily_challenge_completions for select using (auth.uid() = user_id);
create policy "dcc_insert_own" on daily_challenge_completions for insert with check (auth.uid() = user_id);

-- Flashcards (Spaced Repetition, vereinfachtes SM-2)
create table if not exists flashcards (
  id uuid primary key default gen_random_uuid(),
  tag text not null default 'Allgemein',
  front text not null,
  back text not null,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table flashcards enable row level security;
create policy "flashcards_select_all" on flashcards for select using (true);
create policy "flashcards_write_managers" on flashcards for insert
  with check (exists (select 1 from profiles where id = auth.uid() and role = 'manager'));
create policy "flashcards_delete_managers" on flashcards for delete
  using (exists (select 1 from profiles where id = auth.uid() and role = 'manager'));

create table if not exists flashcard_progress (
  user_id uuid not null references profiles(id) on delete cascade,
  card_id uuid not null references flashcards(id) on delete cascade,
  ease_factor real not null default 2.5,
  interval_days integer not null default 1,
  next_review_date date not null default current_date,
  last_result text,
  updated_at timestamptz not null default now(),
  primary key (user_id, card_id)
);
alter table flashcard_progress enable row level security;
create policy "fp_select_own" on flashcard_progress for select using (auth.uid() = user_id);
create policy "fp_upsert_own" on flashcard_progress for insert with check (auth.uid() = user_id);
create policy "fp_update_own" on flashcard_progress for update using (auth.uid() = user_id);

-- Quiz-Duelle (1 gegen 1)
create table if not exists duels (
  id uuid primary key default gen_random_uuid(),
  challenger_id uuid not null references profiles(id) on delete cascade,
  opponent_id uuid not null references profiles(id) on delete cascade,
  question_ids jsonb not null,
  challenger_score integer,
  opponent_score integer,
  status text not null default 'pending' check (status in ('pending', 'challenger_done', 'completed')),
  created_at timestamptz not null default now()
);
alter table duels enable row level security;
create policy "duels_select_participant" on duels for select
  using (auth.uid() = challenger_id or auth.uid() = opponent_id);
create policy "duels_insert_challenger" on duels for insert
  with check (auth.uid() = challenger_id);
create policy "duels_update_participant" on duels for update
  using (auth.uid() = challenger_id or auth.uid() = opponent_id);

-- Neue Sidebar-Reiter
insert into nav_items (key, label, icon, route, is_builtin, requires_manager, order_index) values
  ('daily-challenge', 'Tages-Challenge', 'flame', '/daily-challenge', true, false, 14),
  ('duel', 'Quiz-Duell', 'target', '/duel', true, false, 15),
  ('simulator', 'Szenario-Simulator', 'chat', '/simulator', true, false, 16),
  ('flashcards', 'Flashcards', 'library', '/flashcards', true, false, 17)
on conflict (key) do nothing;

-- Erste Flashcards aus bereits vorhandenem Wissen (Beispiele — Manager können jederzeit mehr anlegen).
insert into flashcards (tag, front, back) values
  ('Psychologie', 'Was ist der Unterschied zwischen System 1 und System 2 (Kahneman)?', 'System 1 entscheidet schnell, intuitiv und emotional. System 2 liefert danach die langsame, rationale Begründung. Die meisten Kaufimpulse entstehen in System 1.'),
  ('Einwände', 'Was sind die 4 Schritte der Einwandbehandlung?', 'Anerkennen → Verstehen/Nachfragen → Reframing → Bestätigung.'),
  ('Verhandlung', 'Was ist der Ankereffekt in Preisverhandlungen?', 'Wer zuerst eine Zahl nennt, prägt den weiteren Verhandlungsrahmen — meist zu seinen Gunsten.'),
  ('Kaltakquise', 'Was ist meist das realistische Ziel eines Erstanrufs?', 'Nicht der Sofort-Abschluss, sondern ein qualifizierter nächster Schritt: Termin, Rückruf, bestätigtes Interesse.'),
  ('Abschluss', 'Was ist ein typisches Kaufsignal?', 'Konkrete Nachfragen zu Lieferzeit, Ablauf oder Vertragsdetails.'),
  ('Ethik', 'Welcher einfache Test unterscheidet Manipulation von legitimer Beeinflussung?', 'Würde die Aussage auch dann noch stimmen, wenn der Kunde sie vollständig nachprüfen könnte? Wenn nein: Manipulation.')
on conflict do nothing;

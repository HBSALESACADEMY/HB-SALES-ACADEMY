-- Migration 31: Lesebestätigungen pro Person (behebt "einer liest, für alle gelesen"-Bug)
-- Einmalig im Supabase SQL Editor ausführen.

create table if not exists conversation_reads (
  user_id uuid not null references profiles(id) on delete cascade,
  target_id uuid not null, -- bei 1:1: die ID des Gesprächspartners; bei Gruppen: die Gruppen-ID
  is_group boolean not null default false,
  last_read_at timestamptz not null default now(),
  primary key (user_id, target_id, is_group)
);

alter table conversation_reads enable row level security;

create policy "conversation_reads_select_own" on conversation_reads for select using (auth.uid() = user_id);
create policy "conversation_reads_upsert_own" on conversation_reads for insert with check (auth.uid() = user_id);
create policy "conversation_reads_update_own" on conversation_reads for update using (auth.uid() = user_id);

-- Gruppenmitglieder dürfen sehen, wann die ANDEREN Mitglieder derselben Gruppe zuletzt gelesen haben
-- (das ist die eigentliche Lesebestätigung in Gruppen).
create policy "conversation_reads_select_group_peers" on conversation_reads for select
  using (is_group = true and is_group_member(target_id, auth.uid()));

-- Bei 1:1-Chats darf der jeweils andere Gesprächspartner sehen, wann ICH gelesen habe.
create policy "conversation_reads_select_dm_partner" on conversation_reads for select
  using (is_group = false and target_id = auth.uid());

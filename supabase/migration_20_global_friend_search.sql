-- Migration 20: Freundschaftsanfragen bleiben unternehmensübergreifend
-- (wie die Community), plus Grundlage für die globale Namenssuche.
-- Einmalig im Supabase SQL Editor ausführen.
--
-- migration_15 hatte friendships_insert_own auf "nur selbe Organisation"
-- eingeschränkt — das widerspricht der bewussten Entscheidung, dass die
-- Community (und damit auch Freundschaften) unternehmensübergreifend
-- bleiben soll. Wird hier zurückgenommen.

drop policy if exists "friendships_insert_own" on friendships;
create policy "friendships_insert_own" on friendships for insert with check (
  auth.uid() = requester_id
  and not exists (
    select 1 from blocks b
    where (b.blocker_id = friendships.addressee_id and b.blocked_id = friendships.requester_id)
       or (b.blocker_id = friendships.requester_id and b.blocked_id = friendships.addressee_id)
  )
);

-- Migration 43: Streaks laufen tatsächlich ab (statt beliebig lange "in
-- Gefahr" stehen zu bleiben) + XP-Verlust beim Reißen einer Serie.
--
-- increment_xp erlaubte technisch schon negative Beträge, hatte aber keine
-- Untergrenze — xp könnte dadurch unter 0 fallen. Jetzt mit GREATEST(0, ...)
-- abgesichert, damit XP-Verlust (Streak-Verlust oder künftige Fälle)
-- generell sicher ist.
-- Einmalig im Supabase SQL Editor ausführen.

create or replace function public.increment_xp(uid uuid, amount integer)
returns void
language plpgsql as $$
begin
  update profiles set xp = greatest(0, xp + amount) where id = uid;
  insert into xp_log (user_id, amount) values (uid, amount);
end;
$$;

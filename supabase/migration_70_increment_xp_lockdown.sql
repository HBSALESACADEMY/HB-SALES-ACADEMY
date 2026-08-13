-- increment_xp(uid, amount) hatte keinerlei Zugriffsbeschränkung: jede
-- eingeloggte Person konnte die Funktion per Browser-Konsole direkt mit
-- BELIEBIGER uid und BELIEBIGEM amount aufrufen — also anderen Mitgliedern
-- XP wegnehmen/geben oder sich selbst beliebig viel XP gutschreiben,
-- unabhängig von jeder Spiellogik (Quiz/Duell/Tages-Challenge/Simulator).
-- Jetzt nur noch für den Service-Role-Client aufrufbar; alle Aufrufstellen
-- laufen serverseitig darüber (siehe API-Routen). Zusätzlich eine
-- Plausibilitätsgrenze pro Aufruf als zweite Sicherheitsebene.
create or replace function public.increment_xp(uid uuid, amount integer)
returns void
language plpgsql as $$
declare
  bounded_amount integer := greatest(-1000, least(1000, amount));
begin
  update profiles set xp = greatest(0, xp + bounded_amount) where id = uid;
  insert into xp_log (user_id, amount) values (uid, bounded_amount);
end;
$$;

revoke execute on function public.increment_xp(uuid, integer) from public;
revoke execute on function public.increment_xp(uuid, integer) from anon;
revoke execute on function public.increment_xp(uuid, integer) from authenticated;
grant execute on function public.increment_xp(uuid, integer) to service_role;

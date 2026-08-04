-- Bug: "new row violates row-level security policy for table mentor_pairs"
-- beim Anlegen eines Mentoren-Paars (auch beim Eintragen als Mentor für
-- sich selbst) — als Plattform-Admin, der per Firmencode "als" eine andere
-- Organisation eingeloggt ist. Gleicher Grund wie bei teams/team_members
-- (migration_57): same_org(mentor_id, auth.uid()) bzw.
-- same_org(mentee_id, auth.uid()) vergleicht die Heimat-Organisation des
-- Plattform-Admin-Kontos statt der gerade aktiv verwalteten Organisation.
drop policy if exists "mentor_pairs_insert_manager" on mentor_pairs;
create policy "mentor_pairs_insert_manager" on mentor_pairs for insert with check (
  auth.uid() = manager_id
  and (
    (same_org(mentor_id, auth.uid()) and same_org(mentee_id, auth.uid()))
    or exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_platform_admin)
  )
);

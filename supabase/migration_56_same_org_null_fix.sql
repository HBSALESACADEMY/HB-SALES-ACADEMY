-- Bug: "new row violates row-level security policy for table team_members"
-- beim Anlegen eines eigenen Teams. Ursache: same_org(a, b) verglich bisher
-- mit "=" — und in SQL ist NULL = NULL nie true, sondern NULL (also falsch).
-- Hat ein Profil (z.B. ein Plattform-Admin-Konto ohne feste Heimat-
-- Organisation) organization_id = NULL, schlug dadurch same_org(x, x) SOGAR
-- beim Vergleich mit sich selbst fehl — team_members_insert_lead prüft
-- genau das (is_lead_of_team(...) and same_org(user_id, auth.uid())), wenn
-- der Team-Ersteller sich selbst als erstes Mitglied hinzufügt.
-- "is not distinct from" behandelt NULL = NULL korrekt als true, ändert an
-- allen bestehenden Policies sonst nichts (same_org() wird an vielen Stellen
-- genutzt, aber diese Funktion einmal zu korrigieren reicht).
create or replace function public.same_org(a uuid, b uuid)
returns boolean
language sql stable security definer as $$
  select exists (
    select 1 from profiles pa, profiles pb
    where pa.id = a and pb.id = b and pa.organization_id is not distinct from pb.organization_id
  );
$$;

-- Bisher wurde die Organisation eines Community-Beitrags beim ANZEIGEN
-- dynamisch aus profiles.organization_id des/der Autor:in abgeleitet. Für
-- Plattform-Admins, die per Firmencode "als" eine andere Organisation
-- unterwegs sind, ist das die falsche (eigene Heimat-)Organisation statt der
-- gerade aktiven — ihre eigenen Beiträge verschwanden dadurch aus der
-- "Meine Organisation"-Ansicht. Jetzt wird die aktive Organisation beim
-- Erstellen fest auf dem Beitrag gespeichert (wie an anderen Stellen in
-- dieser Session, z.B. migration_53).
alter table community_posts add column if not exists organization_id uuid references organizations(id) on delete set null;

update community_posts set organization_id = (
  select profiles.organization_id from profiles where profiles.id = community_posts.user_id
) where organization_id is null;

drop policy if exists "community_posts_insert_own" on community_posts;
create policy "community_posts_insert_own" on community_posts for insert with check (
  auth.uid() = user_id
  and (
    organization_id is null
    or organization_id = (select organization_id from profiles where profiles.id = auth.uid())
    or exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_platform_admin)
  )
);

-- Migration 19: Plattform-Admin darf Logos für JEDE Organisation hochladen
-- (bisher nur für die eigene), analog zur organizations-Tabelle selbst.
-- Einmalig im Supabase SQL Editor ausführen.

drop policy if exists "org_logos_admin_upload" on storage.objects;
create policy "org_logos_admin_upload" on storage.objects for insert with check (
  bucket_id = 'org-logos'
  and (
    exists (
      select 1 from profiles where id = auth.uid() and is_admin = true
      and organization_id::text = (storage.foldername(name))[1]
    )
    or exists (select 1 from profiles where id = auth.uid() and is_platform_admin = true)
  )
);

drop policy if exists "org_logos_admin_update" on storage.objects;
create policy "org_logos_admin_update" on storage.objects for update using (
  bucket_id = 'org-logos'
  and (
    exists (
      select 1 from profiles where id = auth.uid() and is_admin = true
      and organization_id::text = (storage.foldername(name))[1]
    )
    or exists (select 1 from profiles where id = auth.uid() and is_platform_admin = true)
  )
);

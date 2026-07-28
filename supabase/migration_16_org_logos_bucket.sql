-- Migration 16: Storage-Bucket für hochgeladene Organisations-Logos.
-- Einmalig im Supabase SQL Editor ausführen.
-- Pfad-Konvention: org-logos/<organization_id>/logo.<ext>

insert into storage.buckets (id, name, public) values ('org-logos', 'org-logos', true)
on conflict (id) do nothing;

drop policy if exists "org_logos_public_read" on storage.objects;
create policy "org_logos_public_read" on storage.objects for select using (bucket_id = 'org-logos');

drop policy if exists "org_logos_admin_upload" on storage.objects;
create policy "org_logos_admin_upload" on storage.objects for insert with check (
  bucket_id = 'org-logos'
  and exists (
    select 1 from profiles where id = auth.uid() and is_admin = true
    and organization_id::text = (storage.foldername(name))[1]
  )
);

drop policy if exists "org_logos_admin_update" on storage.objects;
create policy "org_logos_admin_update" on storage.objects for update using (
  bucket_id = 'org-logos'
  and exists (
    select 1 from profiles where id = auth.uid() and is_admin = true
    and organization_id::text = (storage.foldername(name))[1]
  )
);

-- CRM-Anbindung (Close): jeder Nutzer verbindet sein eigenes Close-Konto
-- über einen persönlichen API-Key. Bewusst NICHT in profiles gespeichert,
-- damit der Key nie über eine (später vielleicht großzügigere) profiles-
-- Policy für Kollegen sichtbar werden kann — eigene Tabelle, RLS ausschließlich
-- auf den eigenen Nutzer beschränkt.
create table if not exists crm_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade unique,
  provider text not null default 'close' check (provider in ('close')),
  api_key text not null,
  close_user_id text,
  close_user_email text,
  connected_at timestamptz not null default now()
);

alter table crm_connections enable row level security;

drop policy if exists "crm_connections_select_own" on crm_connections;
create policy "crm_connections_select_own" on crm_connections for select using (
  user_id = auth.uid()
);
drop policy if exists "crm_connections_insert_own" on crm_connections;
create policy "crm_connections_insert_own" on crm_connections for insert with check (
  user_id = auth.uid()
);
drop policy if exists "crm_connections_update_own" on crm_connections;
create policy "crm_connections_update_own" on crm_connections for update using (
  user_id = auth.uid()
);
drop policy if exists "crm_connections_delete_own" on crm_connections;
create policy "crm_connections_delete_own" on crm_connections for delete using (
  user_id = auth.uid()
);

-- Neuer Sidebar-Eintrag, sichtbar für alle (kein requires_manager) — jeder
-- Vertriebler verbindet sein eigenes Close-Konto individuell.
insert into nav_items (key, label, icon, route, is_builtin, requires_manager, order_index)
select 'crm', 'CRM', 'target', '/crm', true, false,
  coalesce((select max(order_index) from nav_items where is_builtin = true), 0) + 1
where not exists (select 1 from nav_items where key = 'crm');

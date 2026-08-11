-- Feature-Wunsch: automatische E-Mail-Benachrichtigung bei neuen Terminen,
-- zusätzlich zu den bestehenden Org-Managern konfigurierbare
-- Benachrichtigungs-Adressen (verwaltbar durch role='backend' und Admins).
create table if not exists notification_emails (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  email text not null,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (organization_id, email)
);

alter table notification_emails enable row level security;

-- Sichtbar/verwaltbar für Manager, Backend-Rolle, Admins der eigenen
-- Organisation sowie Plattform-Admins (mit demselben is_platform_admin-
-- Bypass-Muster wie an anderer Stelle in der App, siehe migration_59).
drop policy if exists "notification_emails_select" on notification_emails;
create policy "notification_emails_select" on notification_emails for select using (
  exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_platform_admin)
  or (
    exists (select 1 from profiles where profiles.id = auth.uid() and (profiles.role in ('manager', 'backend') or profiles.is_admin))
    and organization_id = (select organization_id from profiles where profiles.id = auth.uid())
  )
);
drop policy if exists "notification_emails_insert" on notification_emails;
create policy "notification_emails_insert" on notification_emails for insert with check (
  exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_platform_admin)
  or (
    exists (select 1 from profiles where profiles.id = auth.uid() and (profiles.role in ('manager', 'backend') or profiles.is_admin))
    and organization_id = (select organization_id from profiles where profiles.id = auth.uid())
  )
);
drop policy if exists "notification_emails_delete" on notification_emails;
create policy "notification_emails_delete" on notification_emails for delete using (
  exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_platform_admin)
  or (
    exists (select 1 from profiles where profiles.id = auth.uid() and (profiles.role in ('manager', 'backend') or profiles.is_admin))
    and organization_id = (select organization_id from profiles where profiles.id = auth.uid())
  )
);

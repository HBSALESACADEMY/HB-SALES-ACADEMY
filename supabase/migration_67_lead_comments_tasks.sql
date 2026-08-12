-- Kommentare (inkl. @Erwähnungen) und Aufgaben-Zuweisung pro Termin.
create table if not exists lead_comments (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now()
);

create table if not exists lead_tasks (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  assigned_to uuid not null references profiles(id) on delete cascade,
  assigned_by uuid not null references profiles(id) on delete cascade,
  title text not null,
  due_date date,
  done boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists lead_comments_lead_idx on lead_comments(lead_id, created_at);
create index if not exists lead_tasks_lead_idx on lead_tasks(lead_id, created_at);

alter table lead_comments enable row level security;
alter table lead_tasks enable row level security;

-- --- lead_comments --- (Sichtbarkeit = Sichtbarkeit des Termins, siehe leads_select)
drop policy if exists "lead_comments_select_all" on lead_comments;
create policy "lead_comments_select_all" on lead_comments for select using (
  exists (
    select 1 from leads l where l.id = lead_comments.lead_id
    and (
      l.created_by = auth.uid()
      or exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_platform_admin)
      or (
        exists (select 1 from profiles where profiles.id = auth.uid() and (profiles.role = 'manager' or profiles.role = 'backend' or profiles.is_admin))
        and same_org(l.created_by, auth.uid())
      )
    )
  )
);
drop policy if exists "lead_comments_insert_own" on lead_comments;
create policy "lead_comments_insert_own" on lead_comments for insert with check (
  auth.uid() = user_id
  and exists (
    select 1 from leads l where l.id = lead_comments.lead_id
    and (
      l.created_by = auth.uid()
      or exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_platform_admin)
      or (
        exists (select 1 from profiles where profiles.id = auth.uid() and (profiles.role = 'manager' or profiles.role = 'backend' or profiles.is_admin))
        and same_org(l.created_by, auth.uid())
      )
    )
  )
);
drop policy if exists "lead_comments_delete_own_or_manager" on lead_comments;
create policy "lead_comments_delete_own_or_manager" on lead_comments for delete using (
  auth.uid() = user_id
  or exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_platform_admin)
  or exists (
    select 1 from leads l where l.id = lead_comments.lead_id
    and exists (select 1 from profiles where profiles.id = auth.uid() and (profiles.role = 'manager' or profiles.is_admin))
    and same_org(l.created_by, auth.uid())
  )
);

-- --- lead_tasks ---
drop policy if exists "lead_tasks_select_all" on lead_tasks;
create policy "lead_tasks_select_all" on lead_tasks for select using (
  assigned_to = auth.uid()
  or assigned_by = auth.uid()
  or exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_platform_admin)
  or exists (
    select 1 from leads l where l.id = lead_tasks.lead_id
    and exists (select 1 from profiles where profiles.id = auth.uid() and (profiles.role = 'manager' or profiles.role = 'backend' or profiles.is_admin))
    and same_org(l.created_by, auth.uid())
  )
);
drop policy if exists "lead_tasks_insert_own" on lead_tasks;
create policy "lead_tasks_insert_own" on lead_tasks for insert with check (
  auth.uid() = assigned_by
  and exists (
    select 1 from leads l where l.id = lead_tasks.lead_id
    and (
      l.created_by = auth.uid()
      or exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_platform_admin)
      or (
        exists (select 1 from profiles where profiles.id = auth.uid() and (profiles.role = 'manager' or profiles.role = 'backend' or profiles.is_admin))
        and same_org(l.created_by, auth.uid())
      )
    )
  )
);
drop policy if exists "lead_tasks_update_involved_or_manager" on lead_tasks;
create policy "lead_tasks_update_involved_or_manager" on lead_tasks for update using (
  assigned_to = auth.uid()
  or assigned_by = auth.uid()
  or exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_platform_admin)
  or exists (
    select 1 from leads l where l.id = lead_tasks.lead_id
    and exists (select 1 from profiles where profiles.id = auth.uid() and (profiles.role = 'manager' or profiles.is_admin))
    and same_org(l.created_by, auth.uid())
  )
);
drop policy if exists "lead_tasks_delete_own_or_manager" on lead_tasks;
create policy "lead_tasks_delete_own_or_manager" on lead_tasks for delete using (
  assigned_by = auth.uid()
  or exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_platform_admin)
  or exists (
    select 1 from leads l where l.id = lead_tasks.lead_id
    and exists (select 1 from profiles where profiles.id = auth.uid() and (profiles.role = 'manager' or profiles.is_admin))
    and same_org(l.created_by, auth.uid())
  )
);

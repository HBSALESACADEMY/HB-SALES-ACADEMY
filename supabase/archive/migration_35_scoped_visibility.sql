-- Migration 35: Sichtbarkeit einschränken (nur Team + Community-Aktive) & Rangliste-Opt-out
-- Einmalig im Supabase SQL Editor ausführen — am besten in den 3 Blöcken unten.

-- BLOCK 1: Sichtbarkeits-Funktion (security definer, vermeidet RLS-Rekursion)
create or replace function can_view_profile(target_id uuid, viewer_id uuid)
returns boolean as $$
  select
    target_id = viewer_id
    or exists (select 1 from profiles v where v.id = viewer_id and (v.is_admin = true or v.role = 'manager'))
    or exists (select 1 from profiles t where t.id = target_id and t.role = 'manager')
    or exists (
      select 1 from profiles v, profiles t
      where v.id = viewer_id and t.id = target_id
        and (v.manager_id = t.id or t.manager_id = v.manager_id or (v.role = 'manager' and t.manager_id = v.id))
    )
    or exists (select 1 from community_posts cp where cp.user_id = target_id)
    or exists (select 1 from community_comments cc where cc.user_id = target_id)
$$ language sql security definer stable;

-- BLOCK 2: Die alte, zu großzügige Regel ersetzen
drop policy if exists "profiles_select_leaderboard" on profiles;
create policy "profiles_select_scoped" on profiles for select
  using (can_view_profile(id, auth.uid()));

-- BLOCK 3: Rangliste-Opt-out
alter table profiles add column if not exists leaderboard_opt_out boolean not null default false;

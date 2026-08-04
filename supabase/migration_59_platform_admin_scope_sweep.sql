-- Systematischer Nachzieher zu migration_53/57/58: same_org() vergleicht die
-- HEIMAT-Organisation eines Plattform-Admin-Kontos, nicht die per Firmencode
-- gerade AKTIV verwaltete Organisation. Betraf bisher schon Navigation,
-- Kurse, Teams und Mentoring-Paare — dieser Sweep deckt alle übrigen
-- Stellen im Schema ab, an denen dasselbe Muster auftritt, damit
-- Plattform-Admins jede Organisation, die sie per Firmencode verwalten,
-- vollständig bedienen können (Wissensdatenbank, Skripte, Leitfäden,
-- Flashcards, Community, Nachrichten, Blockieren, Chat-Gruppen,
-- Team-Ziele, Anruf-Statistiken, XP-Rangliste, Duelle).

-- --- kb_entries ---
drop policy if exists "kb_entries_select_approved" on kb_entries;
create policy "kb_entries_select_approved" on kb_entries for select using (
  status = 'approved'
  and (same_org(created_by, auth.uid()) or exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_platform_admin))
);
drop policy if exists "kb_entries_select_managers_all" on kb_entries;
create policy "kb_entries_select_managers_all" on kb_entries for select using (
  (
    exists (select 1 from profiles where profiles.id = auth.uid() and (profiles.role in ('manager', 'trainer') or profiles.is_admin or profiles.is_platform_admin))
    or is_team_lead(auth.uid())
  ) and (same_org(created_by, auth.uid()) or exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_platform_admin))
);
drop policy if exists "kb_entries_update_managers" on kb_entries;
create policy "kb_entries_update_managers" on kb_entries for update using (
  (
    exists (select 1 from profiles where profiles.id = auth.uid() and (profiles.role in ('manager', 'trainer') or profiles.is_admin or profiles.is_platform_admin))
    or is_team_lead(auth.uid())
  ) and (same_org(created_by, auth.uid()) or exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_platform_admin))
);
drop policy if exists "kb_entries_delete_managers" on kb_entries;
create policy "kb_entries_delete_managers" on kb_entries for delete using (
  (
    exists (select 1 from profiles where profiles.id = auth.uid() and (profiles.role in ('manager', 'trainer') or profiles.is_admin or profiles.is_platform_admin))
    or is_team_lead(auth.uid())
  ) and (same_org(created_by, auth.uid()) or exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_platform_admin))
);

-- --- scripts ---
drop policy if exists "scripts_select_all" on scripts;
create policy "scripts_select_all" on scripts for select using (
  created_by = auth.uid()
  or (visibility = 'org' and same_org(created_by, auth.uid()))
  or exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_platform_admin)
);
drop policy if exists "scripts_update_managers" on scripts;
create policy "scripts_update_managers" on scripts for update using (
  (
    exists (select 1 from profiles where profiles.id = auth.uid() and (profiles.role = 'manager' or profiles.is_admin or profiles.is_platform_admin))
    or is_team_lead(auth.uid())
  ) and (same_org(created_by, auth.uid()) or exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_platform_admin))
);
drop policy if exists "scripts_delete_managers" on scripts;
create policy "scripts_delete_managers" on scripts for delete using (
  (
    exists (select 1 from profiles where profiles.id = auth.uid() and (profiles.role = 'manager' or profiles.is_admin or profiles.is_platform_admin))
    or is_team_lead(auth.uid())
  ) and (same_org(created_by, auth.uid()) or exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_platform_admin))
);

-- --- guides ---
drop policy if exists "guides_select_published" on guides;
create policy "guides_select_published" on guides for select using (
  is_published = true
  and (same_org(created_by, auth.uid()) or exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_platform_admin))
);
drop policy if exists "guides_delete_own_or_manager" on guides;
create policy "guides_delete_own_or_manager" on guides for delete using (
  auth.uid() = created_by
  or exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_platform_admin)
  or (exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'manager') and same_org(created_by, auth.uid()))
);

-- --- flashcards ---
drop policy if exists "flashcards_select_all" on flashcards;
create policy "flashcards_select_all" on flashcards for select using (
  same_org(created_by, auth.uid())
  or exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_platform_admin)
);
drop policy if exists "flashcards_delete_managers" on flashcards;
create policy "flashcards_delete_managers" on flashcards for delete using (
  (
    exists (select 1 from profiles where profiles.id = auth.uid() and (profiles.role in ('manager', 'trainer') or profiles.is_admin or profiles.is_platform_admin))
    or is_team_lead(auth.uid())
  ) and (same_org(created_by, auth.uid()) or exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_platform_admin))
);

-- --- duels ---
drop policy if exists "duels_insert_challenger" on duels;
create policy "duels_insert_challenger" on duels for insert with check (
  auth.uid() = challenger_id
  and (same_org(challenger_id, opponent_id) or exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_platform_admin))
);

-- --- community_posts ---
drop policy if exists "community_posts_select_all" on community_posts;
create policy "community_posts_select_all" on community_posts for select using (
  visibility = 'global'
  or same_org(user_id, auth.uid())
  or exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_platform_admin)
);
drop policy if exists "community_posts_delete_own_or_manager" on community_posts;
create policy "community_posts_delete_own_or_manager" on community_posts for delete using (
  auth.uid() = user_id
  or exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_platform_admin)
  or (exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'manager') and same_org(user_id, auth.uid()))
);

-- --- community_comments ---
drop policy if exists "community_comments_select_all" on community_comments;
create policy "community_comments_select_all" on community_comments for select using (
  exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_platform_admin)
  or exists (
    select 1 from community_posts cp where cp.id = community_comments.post_id
    and (cp.visibility = 'global' or same_org(cp.user_id, auth.uid()))
  )
);
drop policy if exists "community_comments_insert_own" on community_comments;
create policy "community_comments_insert_own" on community_comments for insert with check (
  auth.uid() = user_id
  and (
    exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_platform_admin)
    or exists (
      select 1 from community_posts cp where cp.id = community_comments.post_id
      and (cp.visibility = 'global' or same_org(cp.user_id, auth.uid()))
    )
  )
);
drop policy if exists "community_comments_delete_own_or_manager" on community_comments;
create policy "community_comments_delete_own_or_manager" on community_comments for delete using (
  auth.uid() = user_id
  or exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_platform_admin)
  or (exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'manager') and same_org(user_id, auth.uid()))
);

-- --- community_kudos ---
drop policy if exists "community_kudos_select_all" on community_kudos;
create policy "community_kudos_select_all" on community_kudos for select using (
  exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_platform_admin)
  or exists (
    select 1 from community_posts cp where cp.id = community_kudos.post_id
    and (cp.visibility = 'global' or same_org(cp.user_id, auth.uid()))
  )
);
drop policy if exists "community_kudos_insert_own" on community_kudos;
create policy "community_kudos_insert_own" on community_kudos for insert with check (
  auth.uid() = user_id
  and (
    exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_platform_admin)
    or exists (
      select 1 from community_posts cp where cp.id = community_kudos.post_id
      and (cp.visibility = 'global' or same_org(cp.user_id, auth.uid()))
    )
  )
);

-- --- community_comment_kudos ---
drop policy if exists "community_comment_kudos_select_all" on community_comment_kudos;
create policy "community_comment_kudos_select_all" on community_comment_kudos for select using (
  exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_platform_admin)
  or exists (
    select 1 from community_comments cc
    join community_posts cp on cp.id = cc.post_id
    where cc.id = community_comment_kudos.comment_id
    and (cp.visibility = 'global' or same_org(cp.user_id, auth.uid()))
  )
);
drop policy if exists "community_comment_kudos_insert_own" on community_comment_kudos;
create policy "community_comment_kudos_insert_own" on community_comment_kudos for insert with check (
  auth.uid() = user_id
  and (
    exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_platform_admin)
    or exists (
      select 1 from community_comments cc
      join community_posts cp on cp.id = cc.post_id
      where cc.id = community_comment_kudos.comment_id
      and (cp.visibility = 'global' or same_org(cp.user_id, auth.uid()))
    )
  )
);

-- --- blocks ---
drop policy if exists "blocks_insert_own" on blocks;
create policy "blocks_insert_own" on blocks for insert with check (
  auth.uid() = blocker_id
  and (same_org(blocker_id, blocked_id) or exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_platform_admin))
);

-- --- chat_group_members ---
drop policy if exists "chat_group_members_insert" on chat_group_members;
create policy "chat_group_members_insert" on chat_group_members for insert with check (
  (
    exists (select 1 from chat_groups g where g.id = chat_group_members.group_id and g.created_by = auth.uid())
    or exists (select 1 from chat_group_members m2 where m2.group_id = chat_group_members.group_id and m2.user_id = auth.uid())
  )
  and (same_org(user_id, auth.uid()) or exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_platform_admin))
);

-- --- direct_messages ---
drop policy if exists "dm_insert_friends" on direct_messages;
create policy "dm_insert_friends" on direct_messages for insert with check (
  auth.uid() = sender_id
  and (
    (group_id is not null and is_group_member(group_id, auth.uid()))
    or (
      group_id is null and recipient_id is not null
      and (
        same_org(sender_id, recipient_id)
        or exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_platform_admin)
        or exists (
          select 1 from friendships f
          where f.status = 'accepted'
            and ((f.requester_id = direct_messages.sender_id and f.addressee_id = direct_messages.recipient_id)
              or (f.requester_id = direct_messages.recipient_id and f.addressee_id = direct_messages.sender_id))
        )
      )
      and not exists (
        select 1 from blocks b
        where (b.blocker_id = direct_messages.recipient_id and b.blocked_id = direct_messages.sender_id)
           or (b.blocker_id = direct_messages.sender_id and b.blocked_id = direct_messages.recipient_id)
      )
    )
  )
);

-- --- xp_log ---
drop policy if exists "xp_log_select_all" on xp_log;
create policy "xp_log_select_all" on xp_log for select using (
  same_org(user_id, auth.uid())
  or exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_platform_admin)
);

-- --- team_goals ---
drop policy if exists "team_goals_select_all" on team_goals;
create policy "team_goals_select_all" on team_goals for select using (
  same_org(manager_id, auth.uid())
  or exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_platform_admin)
);

-- --- call_log_days ---
drop policy if exists "call_log_days_select_managers" on call_log_days;
create policy "call_log_days_select_managers" on call_log_days for select using (
  is_team_lead_of(user_id, auth.uid())
  or exists (select 1 from profiles where id = auth.uid() and is_platform_admin)
  or (exists (select 1 from profiles where id = auth.uid() and is_admin = true) and same_org(user_id, auth.uid()))
);

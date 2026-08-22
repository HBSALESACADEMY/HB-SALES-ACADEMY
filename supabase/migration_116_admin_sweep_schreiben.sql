-- Letzter Rest des pauschalen Admin-Zweigs — jetzt auf der Schreib-Seite.
--
-- migration_95 hat ihn beim Lesen entfernt, migration_115 bei den zuvor
-- übersehenen Tabellen. Übrig blieben Regeln, die nichts verraten, aber
-- Schreibzugriff über die Grenze hinweg erlauben: einen Beitrag in einer
-- fremden Community anlegen, jemanden in ein fremdes Team setzen, ein
-- Mentoring-Paar über zwei Organisationen hinweg bilden.
--
-- Dieselbe Linie wie zuvor: same_org() und aktive_org() vergleichen gegen die
-- Organisation, in der jemand GERADE ist. Ein Plattform-Admin darf dort
-- weiterhin alles — er kann nur nicht mehr in eine andere hineingreifen.

-- --- Wissensdatenbank ----------------------------------------------------
drop policy if exists "kb_entries_update_managers" on kb_entries;
create policy "kb_entries_update_managers" on kb_entries for update using (
  (ist_fuehrungsrolle(auth.uid())
   or exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'trainer')
   or is_team_lead(auth.uid()))
  and same_org(created_by, auth.uid())
);

drop policy if exists "kb_entries_delete_managers" on kb_entries;
create policy "kb_entries_delete_managers" on kb_entries for delete using (
  (ist_fuehrungsrolle(auth.uid())
   or exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'trainer')
   or is_team_lead(auth.uid()))
  and same_org(created_by, auth.uid())
);

-- --- Leitfäden -----------------------------------------------------------
drop policy if exists "guides_delete_own_or_manager" on guides;
create policy "guides_delete_own_or_manager" on guides for delete using (
  auth.uid() = created_by
  or (ist_fuehrungsrolle(auth.uid()) and same_org(created_by, auth.uid()))
);

-- --- Lernkarten ----------------------------------------------------------
drop policy if exists "flashcards_delete_managers" on flashcards;
create policy "flashcards_delete_managers" on flashcards for delete using (
  (ist_fuehrungsrolle(auth.uid())
   or exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'trainer')
   or is_team_lead(auth.uid()))
  and same_org(created_by, auth.uid())
);

-- --- Persönliche Lernpfade ------------------------------------------------
drop policy if exists "personal_courses_insert" on personal_courses;
create policy "personal_courses_insert" on personal_courses for insert with check (
  user_id = auth.uid()
  or (ist_fuehrungsrolle(auth.uid()) and same_org(user_id, auth.uid()))
);

-- --- Duelle ---------------------------------------------------------------
drop policy if exists "duels_insert_challenger" on duels;
create policy "duels_insert_challenger" on duels for insert with check (
  auth.uid() = challenger_id
  and same_org(challenger_id, opponent_id)
);

-- --- Community ------------------------------------------------------------
-- Beim Anlegen zusätzlich: verglichen wird gegen die AKTIVE Organisation,
-- nicht gegen die Heimat des Kontos (migration_92).
drop policy if exists "community_posts_insert_own" on community_posts;
create policy "community_posts_insert_own" on community_posts for insert with check (
  auth.uid() = user_id
  and (organization_id is null or organization_id is not distinct from aktive_org(auth.uid()))
);

drop policy if exists "community_posts_delete_own_or_manager" on community_posts;
create policy "community_posts_delete_own_or_manager" on community_posts for delete using (
  auth.uid() = user_id
  or (ist_fuehrungsrolle(auth.uid()) and community_post_same_org(organization_id, user_id, auth.uid()))
);

drop policy if exists "community_posts_update_own_or_manager" on community_posts;
create policy "community_posts_update_own_or_manager" on community_posts for update using (
  auth.uid() = user_id
  or (ist_fuehrungsrolle(auth.uid()) and community_post_same_org(organization_id, user_id, auth.uid()))
);

drop policy if exists "community_comments_delete_own_or_manager" on community_comments;
create policy "community_comments_delete_own_or_manager" on community_comments for delete using (
  auth.uid() = user_id
  or (ist_fuehrungsrolle(auth.uid()) and same_org(user_id, auth.uid()))
);

-- --- Blockieren, Gruppen, Nachrichten -------------------------------------
drop policy if exists "blocks_insert_own" on blocks;
create policy "blocks_insert_own" on blocks for insert with check (
  auth.uid() = blocker_id
  and same_org(blocker_id, blocked_id)
);

drop policy if exists "chat_group_members_insert" on chat_group_members;
create policy "chat_group_members_insert" on chat_group_members for insert with check (
  (
    exists (select 1 from chat_groups g where g.id = chat_group_members.group_id and g.created_by = auth.uid())
    or exists (select 1 from chat_group_members m2 where m2.group_id = chat_group_members.group_id and m2.user_id = auth.uid())
  )
  and same_org(user_id, auth.uid())
);

drop policy if exists "dm_insert_friends" on direct_messages;
create policy "dm_insert_friends" on direct_messages for insert with check (
  auth.uid() = sender_id
  and (
    (group_id is not null and is_group_member(group_id, auth.uid()))
    or (
      group_id is null and recipient_id is not null
      and (
        same_org(sender_id, recipient_id)
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

-- --- Teams und Mentoring --------------------------------------------------
drop policy if exists "team_members_insert_lead" on team_members;
create policy "team_members_insert_lead" on team_members for insert with check (
  kann_team_verwalten(team_id, auth.uid())
  and same_org(user_id, auth.uid())
);

drop policy if exists "mentor_pairs_insert_manager" on mentor_pairs;
create policy "mentor_pairs_insert_manager" on mentor_pairs for insert with check (
  auth.uid() = manager_id
  and same_org(mentor_id, auth.uid())
  and same_org(mentee_id, auth.uid())
);

-- --- Aufgaben an Terminen -------------------------------------------------
-- Wer den Termin sehen darf, entscheidet seit migration_114 die Regel von
-- leads selbst — hier bleibt nur die Prüfung, dass die zugewiesene Person
-- zur selben Organisation gehört wie der Termin.
drop policy if exists "lead_tasks_insert_own" on lead_tasks;
create policy "lead_tasks_insert_own" on lead_tasks for insert with check (
  auth.uid() = assigned_by
  and exists (
    select 1 from leads l where l.id = lead_tasks.lead_id
    and same_org(l.created_by, assigned_to)
  )
);

-- Etappe 2 der Mandanten-Trennung: Community, Nachrichten, Lernkarten,
-- Wissensdatenbank, Kurse, Auswertungen und die restlichen Verwaltungsdaten.
--
-- Der grösste Teil erledigt sich über eine einzige Funktion: same_org()
-- steckt in fast allen übrigen Regeln und verglich bisher die FESTE
-- Heimat-Organisation beider Personen. Für einen Plattform-Admin, der per
-- Firmencode für eine andere Organisation arbeitet, ist das die falsche
-- Seite: er sah dadurch weiterhin seine Heimat-Organisation, egal wo er
-- gerade war.
--
-- Für normale Konten ändert sich nichts: aktive_org() ist dort immer die
-- eigene Organisation.
create or replace function public.same_org(a uuid, b uuid)
returns boolean
language sql stable security definer as $$
  -- a = b zuerst: sonst sähe ein Plattform-Admin, der per Firmencode
  -- unterwegs ist, seine EIGENEN Einträge nicht mehr (XP, Ergebnisse,
  -- Aufnahmen) — seine Heimat-Organisation stimmt dann nicht mit der
  -- aktiven überein.
  select a = b
      or (select organization_id from profiles where id = a)
         is not distinct from aktive_org(b);
$$;

-- Dieselbe Umstellung für die Community: alle Regeln dort (Beiträge,
-- Kommentare, Kudos, Umfragen) hängen an dieser einen Funktion.
create or replace function public.community_post_same_org(p_org uuid, p_author uuid, viewer uuid)
returns boolean
language sql stable security definer as $$
  select coalesce(p_org, (select organization_id from profiles where profiles.id = p_author))
         is not distinct from aktive_org(viewer);
$$;

-- Ab hier: die Regeln, die den Plattform-Admin als pauschales ODER führen
-- und damit an same_org() vorbeigehen. Der Zweig entfällt jeweils.

-- --- Community ---
drop policy if exists "community_posts_select_all" on community_posts;
create policy "community_posts_select_all" on community_posts for select using (
  -- 'global' bleibt: bewusst organisationsübergreifend geteilt.
  visibility = 'global'
  or community_post_same_org(organization_id, user_id, auth.uid())
);

drop policy if exists "community_comments_select_all" on community_comments;
create policy "community_comments_select_all" on community_comments for select using (
  exists (
    select 1 from community_posts cp where cp.id = community_comments.post_id
    and (cp.visibility = 'global' or community_post_same_org(cp.organization_id, cp.user_id, auth.uid()))
  )
);

drop policy if exists "community_kudos_select_all" on community_kudos;
create policy "community_kudos_select_all" on community_kudos for select using (
  exists (
    select 1 from community_posts cp where cp.id = community_kudos.post_id
    and (cp.visibility = 'global' or community_post_same_org(cp.organization_id, cp.user_id, auth.uid()))
  )
);

drop policy if exists "community_comment_kudos_select_all" on community_comment_kudos;
create policy "community_comment_kudos_select_all" on community_comment_kudos for select using (
  exists (
    select 1 from community_comments cc
    join community_posts cp on cp.id = cc.post_id
    where cc.id = community_comment_kudos.comment_id
    and (cp.visibility = 'global' or community_post_same_org(cp.organization_id, cp.user_id, auth.uid()))
  )
);

drop policy if exists "community_poll_options_select_all" on community_poll_options;
create policy "community_poll_options_select_all" on community_poll_options for select using (
  exists (
    select 1 from community_posts cp where cp.id = community_poll_options.post_id
    and (cp.visibility = 'global' or community_post_same_org(cp.organization_id, cp.user_id, auth.uid()))
  )
);

drop policy if exists "community_poll_votes_select_all" on community_poll_votes;
create policy "community_poll_votes_select_all" on community_poll_votes for select using (
  exists (
    select 1 from community_posts cp where cp.id = community_poll_votes.post_id
    and (cp.visibility = 'global' or community_post_same_org(cp.organization_id, cp.user_id, auth.uid()))
  )
);

-- --- Lernen und Auswertungen ---
drop policy if exists "flashcards_select_all" on flashcards;
create policy "flashcards_select_all" on flashcards for select using (same_org(created_by, auth.uid()));

drop policy if exists "xp_log_select_all" on xp_log;
create policy "xp_log_select_all" on xp_log for select using (same_org(user_id, auth.uid()));

drop policy if exists "guides_select_published" on guides;
create policy "guides_select_published" on guides for select using (
  is_published = true and same_org(created_by, auth.uid())
);

drop policy if exists "kb_entries_select_approved" on kb_entries;
create policy "kb_entries_select_approved" on kb_entries for select using (
  status = 'approved' and same_org(created_by, auth.uid())
);

drop policy if exists "kb_entries_select_managers_all" on kb_entries;
create policy "kb_entries_select_managers_all" on kb_entries for select using (
  (
    exists (select 1 from profiles where profiles.id = auth.uid()
            and (profiles.role in ('manager', 'trainer') or profiles.is_admin or profiles.is_platform_admin))
    or is_team_lead(auth.uid())
  ) and same_org(created_by, auth.uid())
);

drop policy if exists "quiz_results_select_admin" on quiz_results;
create policy "quiz_results_select_admin" on quiz_results for select using (
  exists (select 1 from profiles where profiles.id = auth.uid()
          and (profiles.role = 'manager' or profiles.role = 'backend' or profiles.is_admin or profiles.is_platform_admin))
  and same_org(user_id, auth.uid())
);

drop policy if exists "exam_results_select_admin" on exam_results;
create policy "exam_results_select_admin" on exam_results for select using (
  exists (select 1 from profiles where profiles.id = auth.uid()
          and (profiles.role = 'manager' or profiles.role = 'backend' or profiles.is_admin or profiles.is_platform_admin))
  and same_org(user_id, auth.uid())
);

drop policy if exists "roleplay_sessions_select_admin" on roleplay_sessions;
create policy "roleplay_sessions_select_admin" on roleplay_sessions for select using (
  exists (select 1 from profiles where profiles.id = auth.uid()
          and (profiles.role = 'manager' or profiles.role = 'backend' or profiles.is_admin or profiles.is_platform_admin))
  and same_org(user_id, auth.uid())
);

drop policy if exists "personal_courses_select" on personal_courses;
create policy "personal_courses_select" on personal_courses for select using (
  user_id = auth.uid()
  or (
    exists (select 1 from profiles where profiles.id = auth.uid()
            and (profiles.role = 'manager' or profiles.is_admin or profiles.is_platform_admin))
    and same_org(user_id, auth.uid())
  )
);

-- --- Protokolle ---
drop policy if exists "login_events_select_admin" on login_events;
create policy "login_events_select_admin" on login_events for select using (
  exists (select 1 from profiles where profiles.id = auth.uid()
          and (profiles.role = 'manager' or profiles.role = 'backend' or profiles.is_admin or profiles.is_platform_admin))
  and same_org(user_id, auth.uid())
);

drop policy if exists "page_views_select_admin" on page_views;
create policy "page_views_select_admin" on page_views for select using (
  exists (select 1 from profiles where profiles.id = auth.uid()
          and (profiles.role = 'manager' or profiles.role = 'backend' or profiles.is_admin or profiles.is_platform_admin))
  and same_org(user_id, auth.uid())
);

-- --- Eigene Inhalte der Organisation ---
-- Hier stand die Organisation der Person fest verdrahtet statt über
-- aktive_org() — ein Plattform-Admin sah damit immer seine Heimat.
drop policy if exists "custom_courses_select_all" on custom_courses;
create policy "custom_courses_select_all" on custom_courses for select using (
  organization_id is not distinct from aktive_org(auth.uid())
);

drop policy if exists "custom_objections_select" on custom_objections;
create policy "custom_objections_select" on custom_objections for select using (
  organization_id is not distinct from aktive_org(auth.uid())
);

drop policy if exists "notification_emails_select" on notification_emails;
create policy "notification_emails_select" on notification_emails for select using (
  exists (select 1 from profiles where profiles.id = auth.uid()
          and (profiles.role in ('manager', 'backend') or profiles.is_admin or profiles.is_platform_admin))
  and organization_id is not distinct from aktive_org(auth.uid())
);

-- Bewusst NICHT eingeschränkt:
--   organizations — der Betreiber braucht die Liste seiner Organisationen,
--     um überhaupt zwischen ihnen wechseln zu können. Sie enthält Stammdaten
--     (Name, Firmencode, Farben), keine Daten der Mitglieder.
--   system_health — Zustand der Plattform selbst, gehört keiner Organisation.

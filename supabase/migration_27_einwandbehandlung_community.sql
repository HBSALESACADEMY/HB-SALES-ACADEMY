-- Migration 27: "Einwandbehandlung" — vorgefilterte Community-Gruppe zum
-- Sammeln von Kundeneinwänden + Formulierungsvorschlägen, inkl. einzeln
-- likebaren Kommentaren ("Top-Antwort"). Nutzt die bestehende Beitrags-/
-- Kommentar-Infrastruktur der Community, kein neues System.
-- Einmalig im Supabase SQL Editor ausführen.

-- 1) Kommentare einzeln likebar machen — eigene Tabelle statt Erweiterung
--    von community_kudos, damit dessen bestehende Struktur (post_id NOT
--    NULL, PK auf post_id+user_id) unangetastet bleibt.
create table if not exists community_comment_kudos (
  comment_id uuid not null references community_comments(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);

alter table community_comment_kudos enable row level security;

-- Sichtbarkeit/Berechtigung folgt exakt demselben Muster wie
-- community_comments/community_kudos: sichtbar bzw. likebar, wenn der
-- zugehörige Beitrag sichtbar ist (global oder eigene Organisation).
drop policy if exists "community_comment_kudos_select_all" on community_comment_kudos;
create policy "community_comment_kudos_select_all" on community_comment_kudos for select using (
  exists (
    select 1 from community_comments cc
    join community_posts cp on cp.id = cc.post_id
    where cc.id = community_comment_kudos.comment_id
    and (cp.visibility = 'global' or same_org(cp.user_id, auth.uid()))
  )
);
drop policy if exists "community_comment_kudos_insert_own" on community_comment_kudos;
create policy "community_comment_kudos_insert_own" on community_comment_kudos for insert with check (
  auth.uid() = user_id
  and exists (
    select 1 from community_comments cc
    join community_posts cp on cp.id = cc.post_id
    where cc.id = community_comment_kudos.comment_id
    and (cp.visibility = 'global' or same_org(cp.user_id, auth.uid()))
  )
);
drop policy if exists "community_comment_kudos_delete_own" on community_comment_kudos;
create policy "community_comment_kudos_delete_own" on community_comment_kudos for delete using (auth.uid() = user_id);

-- 2) Die spezielle Gruppe anlegen, die die "Einwandbehandlung"-Ansicht
--    filtert (idempotent — community_groups.name ist nicht unique).
insert into community_groups (name, description)
select 'Einwandbehandlung', 'Kundeneinwände posten und gemeinsam Formulierungen/Antworten sammeln.'
where not exists (select 1 from community_groups where name = 'Einwandbehandlung');

-- 3) Sidebar-Eintrag, der direkt in diese vorgefilterte Ansicht springt.
insert into nav_items (key, label, icon, route, is_builtin, requires_manager, order_index)
values ('einwandbehandlung', 'Einwandbehandlung', 'flame', '/community?group=Einwandbehandlung', true, false, 13)
on conflict (key) do nothing;

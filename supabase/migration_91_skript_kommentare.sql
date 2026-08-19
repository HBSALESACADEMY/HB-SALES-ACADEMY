-- Skripte: hochladen darf jeder, aufräumen die Leitung.
--
-- migration_90 hatte das Anlegen für Nicht-Führungsrollen auf private
-- Skripte beschränkt. Das ist zu streng: die Bibliothek lebt davon, dass
-- jede Person ihre bewährten Bausteine einbringt. Die Kontrolle sitzt jetzt
-- hinten — Manager, Admins und Teamleads dürfen jedes Skript ihrer
-- Organisation löschen und bearbeiten, also moderieren statt vorzusortieren.
drop policy if exists "scripts_insert" on scripts;
create policy "scripts_insert" on scripts for insert with check (created_by = auth.uid());

drop policy if exists "scripts_update" on scripts;
create policy "scripts_update" on scripts for update
using (
  created_by = auth.uid()
  or (darf_skripte_veroeffentlichen(auth.uid())
      and (same_org(created_by, auth.uid()) or exists (select 1 from profiles where id = auth.uid() and is_platform_admin)))
)
with check (
  created_by = auth.uid()
  or (darf_skripte_veroeffentlichen(auth.uid())
      and (same_org(created_by, auth.uid()) or exists (select 1 from profiles where id = auth.uid() and is_platform_admin)))
);

drop policy if exists "scripts_delete" on scripts;
create policy "scripts_delete" on scripts for delete using (
  created_by = auth.uid()
  or (darf_skripte_veroeffentlichen(auth.uid())
      and (same_org(created_by, auth.uid()) or exists (select 1 from profiles where id = auth.uid() and is_platform_admin)))
);

-- Diskussion zu einem Skript läuft in der Community, nicht in einer zweiten
-- Kommentarspalte an der Datei: dort schauen die Leute ohnehin hin, und
-- Erwähnungen, Kudos und Benachrichtigungen funktionieren dort bereits.
--
-- Ein Beitrag JE SKRIPT: der erste Kommentar legt ihn an, alle weiteren
-- hängen als Antworten darunter. Deshalb der Verweis in beide Richtungen —
-- vom Skript auf den Beitrag (zum Springen) und vom Beitrag auf das Skript
-- (für den Verweis in der Community).
alter table scripts add column if not exists community_post_id uuid references community_posts(id) on delete set null;
alter table community_posts add column if not exists script_id uuid references scripts(id) on delete cascade;

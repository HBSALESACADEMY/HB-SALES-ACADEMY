-- Rückbau eines Fehlers aus migration_116: falsche Vergleichsrichtung.
--
-- same_org(a, b) heisst "gehört a zu der Organisation, in der b GERADE ist".
-- Das ergibt nur Sinn, wenn b die handelnde Person ist. In drei Regeln stand
-- dort aber zweimal ein Gegenüber — etwa same_org(challenger_id,
-- opponent_id): dabei wurde die Organisation des Herausforderers mit der
-- AKTIVEN Organisation des Gegners verglichen. Für normale Konten geht das
-- meistens gut; für einen Plattform-Admin, der per Firmencode in einer
-- Kundenorganisation arbeitet, nie — und genau dort fiel es auf: das
-- Quiz-Duell liess sich nicht mehr starten.
--
-- Richtig ist sieht_person(ziel): "gehört diese Person zu der Organisation,
-- in der ICH gerade bin" (migration_92). Damit gilt die Mandanten-Grenze
-- unverändert, aber sie wird von der richtigen Seite gemessen.

drop policy if exists "duels_insert_challenger" on duels;
create policy "duels_insert_challenger" on duels for insert with check (
  auth.uid() = challenger_id
  and sieht_person(opponent_id)
);

drop policy if exists "blocks_insert_own" on blocks;
create policy "blocks_insert_own" on blocks for insert with check (
  auth.uid() = blocker_id
  and sieht_person(blocked_id)
);

drop policy if exists "dm_insert_friends" on direct_messages;
create policy "dm_insert_friends" on direct_messages for insert with check (
  auth.uid() = sender_id
  and (
    (group_id is not null and is_group_member(group_id, auth.uid()))
    or (
      group_id is null and recipient_id is not null
      and (
        sieht_person(recipient_id)
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

-- Aufgaben an Terminen: die zugewiesene Person muss zu meiner aktiven
-- Organisation gehören. Vorher wurde sie mit der Organisation der
-- anlegenden Person des Termins verglichen — bei einem Admin per
-- Firmencode dieselbe schiefe Richtung.
drop policy if exists "lead_tasks_insert_own" on lead_tasks;
create policy "lead_tasks_insert_own" on lead_tasks for insert with check (
  auth.uid() = assigned_by
  and sieht_person(assigned_to)
  and exists (select 1 from leads l where l.id = lead_tasks.lead_id)
);

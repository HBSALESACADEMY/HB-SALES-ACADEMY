-- Ein Termin gehört zu einer Organisation — ausdrücklich, nicht abgeleitet.
--
-- Gemeldeter Fehler: ein Plattform-Admin, der bei "HB intern" arbeitet, sah
-- im Kalender Termine aus einer anderen Organisation. Grund: leads hat gar
-- keine Organisation. Die Zugehörigkeit ergab sich aus der Person, die den
-- Termin angelegt hat — und "eigene Einträge sieht man immer" gilt in JEDER
-- Organisation. Wer per Firmencode in mehreren unterwegs ist, nahm seine
-- Termine also überallhin mit.
--
-- Dieselbe Lehre wie in migration_53 bei den Navigationspunkten: die
-- Organisation gehört als Spalte an den Datensatz. Abgeleitet aus dem Konto
-- ist sie falsch, sobald jemand in mehr als einer Organisation arbeitet.
alter table leads add column if not exists organization_id uuid references organizations(id) on delete cascade;

-- Bestand nachtragen: die Heimat-Organisation der anlegenden Person ist für
-- Alt-Termine die einzige verfügbare Auskunft — und für alle, die nur in
-- einer Organisation arbeiten, auch die richtige.
update leads
   set organization_id = (select p.organization_id from profiles p where p.id = leads.created_by)
 where organization_id is null;

create index if not exists leads_org_zeit_idx on leads (organization_id, appointment_at);

-- Solange Alt-Datensätze ohne Spalte auftauchen können, bleibt der Rückfall
-- auf die anlegende Person. Als eigene Funktion, weil eine Unterabfrage auf
-- profiles innerhalb einer Regel in die Regeln von profiles zurückliefe —
-- und weil migration_115 dieselbe Frage für Skripte stellt.
create or replace function public.eintrag_org(p_org uuid, p_ersteller uuid)
returns uuid
language sql stable security definer as $$
  select coalesce(p_org, (select organization_id from profiles where id = p_ersteller));
$$;

-- Die Mandanten-Grenze steht jetzt VOR allen Sichtbarkeits-Gründen: erst
-- muss der Termin zur aktiven Organisation gehören, dann erst zählt, ob man
-- ihn angelegt hat, ihn führt, zugewiesen bekam oder eingeladen ist.
drop policy if exists "leads_select" on leads;
create policy "leads_select" on leads for select using (
  eintrag_org(organization_id, created_by) is not distinct from aktive_org(auth.uid())
  and (
    created_by = auth.uid()
    or (ist_fuehrungsrolle(auth.uid()) and sieht_person(created_by))
    or is_team_lead_of(created_by, auth.uid())
    or has_lead_task_or_mention(leads.id)
    or ist_zu_termin_eingeladen(leads.id)
  )
);

-- Ändern und Löschen genauso: der pauschale Zweig für Plattform-Admins
-- entfällt, er hob die Grenze wieder auf (Fortsetzung von migration_95).
drop policy if exists "leads_update" on leads;
create policy "leads_update" on leads for update using (
  eintrag_org(organization_id, created_by) is not distinct from aktive_org(auth.uid())
  and (
    created_by = auth.uid()
    or ist_fuehrungsrolle(auth.uid())
    or is_team_lead_of(created_by, auth.uid())
    or has_lead_task_or_mention(leads.id)
  )
);

drop policy if exists "leads_delete" on leads;
create policy "leads_delete" on leads for delete using (
  eintrag_org(organization_id, created_by) is not distinct from aktive_org(auth.uid())
  and (
    created_by = auth.uid()
    or (exists (select 1 from profiles where profiles.id = auth.uid()
                and (profiles.role = 'manager' or profiles.is_admin or profiles.is_platform_admin))
        and sieht_person(created_by))
    or is_team_lead_of(created_by, auth.uid())
  )
);

-- Neue Termine tragen die Organisation ab sofort selbst ein; ohne diese
-- Prüfung könnte man sie einer fremden zuschreiben.
-- Die alte Regel hiess anders; bliebe sie stehen, würde sie als zweite
-- erlaubende Regel die neue Prüfung wieder aufheben.
drop policy if exists "leads_insert_own" on leads;
drop policy if exists "leads_insert" on leads;
create policy "leads_insert" on leads for insert with check (
  created_by = auth.uid()
  and (organization_id is null or organization_id is not distinct from aktive_org(auth.uid()))
);

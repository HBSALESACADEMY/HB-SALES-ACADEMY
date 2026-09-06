-- Signatur, Vorlagen-Erfolg und Anhänge.
--
-- Drei Ergänzungen rund um die Marketing-Mails.

-- 1) Ein Standardschluss für alle Vorlagen.
--
-- Signatur, Anschrift, Abmeldehinweis: das gehört unter jede Mail, steht
-- aber sonst in jeder Vorlage einzeln. Bei Werbemails an Geschäftskontakte
-- ist ein Absender mit Anschrift Pflicht — und das an einer Stelle zu
-- pflegen ist billiger, als es später in acht Vorlagen nachzuziehen.
alter table organizations add column if not exists email_signatur text;

comment on column organizations.email_signatur is
  'Standardschluss unter jeder Marketing-Mail: Signatur, Anschrift, Abmeldehinweis. Wird beim Versand angehängt.';

-- 2) Welche Vorlage benutzt wurde.
--
-- Ohne das lässt sich nicht sagen, welche Vorlage Termine bringt — und
-- genau das ist die Frage, nach der man die nächste schreibt.
alter table email_kontakte add column if not exists vorlage text;

comment on column email_kontakte.vorlage is
  'Name der verwendeten Mail-Vorlage. Grundlage für die Auswertung, welche Vorlage zu Terminen führt.';

-- 3) Anhänge.
--
-- "Schicken Sie mir mal was" meint oft genau eine Datei. Die Dateien liegen
-- im Speicher, hier steht nur, welche zu welcher Organisation gehört.
create table if not exists email_anhaenge (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  hochgeladen_von uuid references profiles(id) on delete set null,
  name text not null,
  pfad text not null,
  groesse integer,
  created_at timestamptz not null default now()
);

create index if not exists email_anhaenge_org_idx on email_anhaenge (organization_id, created_at desc);

alter table email_anhaenge enable row level security;

-- Sehen darf jede Person der Organisation: ein Vertriebler, der selbst eine
-- Mail schickt, muss den Anhang auswählen können.
drop policy if exists "email_anhaenge_select" on email_anhaenge;
create policy "email_anhaenge_select" on email_anhaenge for select using (
  organization_id is not distinct from aktive_org(auth.uid())
);

-- Verwalten nur die Leitung: was an Kunden geht, gehört nicht in beliebige
-- Hände.
drop policy if exists "email_anhaenge_insert" on email_anhaenge;
create policy "email_anhaenge_insert" on email_anhaenge for insert with check (
  ist_fuehrungsrolle(auth.uid()) and organization_id is not distinct from aktive_org(auth.uid())
);

drop policy if exists "email_anhaenge_delete" on email_anhaenge;
create policy "email_anhaenge_delete" on email_anhaenge for delete using (
  ist_fuehrungsrolle(auth.uid()) and organization_id is not distinct from aktive_org(auth.uid())
);

-- Der Speicherort der Dateien. Nicht öffentlich: die Dateien werden beim
-- Versand serverseitig gelesen und mitgeschickt, sie brauchen keine
-- öffentliche Adresse.
insert into storage.buckets (id, name, public)
values ('email-anhaenge', 'email-anhaenge', false)
on conflict (id) do nothing;

drop policy if exists "email_anhaenge_lesen" on storage.objects;
create policy "email_anhaenge_lesen" on storage.objects for select
  using (bucket_id = 'email-anhaenge' and auth.uid() is not null);

drop policy if exists "email_anhaenge_schreiben" on storage.objects;
create policy "email_anhaenge_schreiben" on storage.objects for insert
  with check (bucket_id = 'email-anhaenge' and ist_fuehrungsrolle(auth.uid()));

drop policy if exists "email_anhaenge_entfernen" on storage.objects;
create policy "email_anhaenge_entfernen" on storage.objects for delete
  using (bucket_id = 'email-anhaenge' and ist_fuehrungsrolle(auth.uid()));

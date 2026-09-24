-- Welcher Auftrag heute schon gelaufen ist.
--
-- Der Morgenbericht des Vertriebsbuddys kam um 9:49 statt um 9:00: Im
-- Vercel-Hobby-Tarif ist ein Cron-Auftrag "irgendwann in dieser Stunde",
-- nicht "zur Minute". Die Minute lässt sich nur von aussen erzwingen — ein
-- Wecker, der die Adresse punkt 9:00 aufruft.
--
-- Dann gibt es aber zwei Auslöser für denselben Bericht, und niemand will
-- ihn zweimal lesen. Diese Tabelle ist die Sperre: Wer zuerst kommt,
-- schickt; der zweite Lauf desselben Tages sieht den Eintrag und hält
-- still.
--
-- Eine Zeile je Auftrag, kein Verlauf: Interessant ist nur, ob HEUTE schon
-- gesendet wurde. Der Zeitstempel bleibt trotzdem drin, denn daran erkennt
-- der Systemstatus einen ausgefallenen Lauf.
create table if not exists cron_laeufe (
  name text primary key,
  tag date not null,
  gelaufen_at timestamptz not null default now()
);

-- Nur der Server schreibt hier, mit dem Dienstschlüssel. Kein angemeldeter
-- Nutzer braucht Zugriff, also bekommt auch keiner eine Regel: Row Level
-- Security an, keine Policy — der Dienstschlüssel umgeht sie ohnehin.
alter table cron_laeufe enable row level security;

-- Die Leitung soll im Systemstatus sehen, wann der Bericht zuletzt lief.
-- Lesen ja, schreiben nein.
drop policy if exists "cron_laeufe_select_fuehrung" on cron_laeufe;
create policy "cron_laeufe_select_fuehrung" on cron_laeufe for select using (
  ist_fuehrungsrolle(auth.uid())
);

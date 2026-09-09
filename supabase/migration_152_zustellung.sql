-- Was aus einer verschickten Mail geworden ist.
--
-- Bisher stand "verschickt", sobald der Mailversand die Nachricht
-- angenommen hatte. Ob sie ZUGESTELLT wurde, wusste niemand: eine falsch
-- aufgeschnappte Adresse sah in der Liste genauso aus wie eine
-- funktionierende. Der Kontakt landete in der Nachfass-Liste, jemand
-- wunderte sich über die fehlende Antwort, und nach fünf Tagen erinnerte
-- die Academy daran, einer toten Adresse hinterherzutelefonieren.
--
-- Wer regelmässig an tote Adressen schickt, verliert ausserdem Reputation —
-- und irgendwann landen auch die guten Mails im Spam.
alter table email_kontakte add column if not exists zustellung text
  check (zustellung is null or zustellung in ('angenommen', 'zugestellt', 'unzustellbar', 'beschwerde'));
alter table email_kontakte add column if not exists zustellung_am timestamptz;
alter table email_kontakte add column if not exists zustellung_grund text;

-- Die Kennung beim Mailversand. Ohne sie liesse sich eine Rückmeldung nur
-- über die Adresse zuordnen — und dann bekäme bei zwei Mails an dieselbe
-- Adresse die falsche den Rückläufer.
alter table email_kontakte add column if not exists versand_id text;

create index if not exists email_kontakte_versand_idx on email_kontakte (versand_id);

comment on column email_kontakte.zustellung is
  'Rückmeldung des Mailversands: angenommen, zugestellt, unzustellbar, beschwerde.';
comment on column email_kontakte.versand_id is
  'Kennung der Mail beim Versanddienst — ordnet Rückmeldungen dem richtigen Kontakt zu.';

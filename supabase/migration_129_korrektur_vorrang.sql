-- Wann ein Tag zuletzt von Hand korrigiert wurde.
--
-- Hintergrund: Damit zwei Geräte sich nicht gegenseitig löschen, gilt beim
-- Abgleich der HÖHERE Wert je Zähler. Das ist richtig, solange nur gezählt
-- wird — ein Zähler wächst schliesslich nur.
--
-- Bei einer Korrektur ist es genau falsch. Wer eine zu hohe Zahl herunter-
-- setzt, bekam sie vom nächsten Gerät, auf dem noch der alte Stand lag,
-- sofort wieder hochgezogen. Die Korrektur musste an jedem Gerät einzeln
-- wiederholt werden, und bis dahin sahen alle anderen den falschen Wert.
--
-- Mit diesem Zeitstempel hat die jüngere Korrektur Vorrang vor dem Maximum:
-- ein Gerät, dessen Stand ÄLTER ist als die letzte Korrektur, übernimmt sie,
-- statt sie zu überschreiben.
alter table call_log_days add column if not exists korrigiert_at timestamptz;

comment on column call_log_days.korrigiert_at is
  'Zeitpunkt der letzten Korrektur von Hand. Ein Gerät mit älterem Stand übernimmt die Serverzahlen, statt das Maximum zu bilden.';

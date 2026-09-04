-- Zeitstempel auch für die Anwahl selbst.
--
-- Bisher hält call_events nur fest, WANN ein Anruf negativ endete oder einen
-- Termin brachte. Die Frage "wie zügig wird telefoniert" braucht aber den
-- Beginn jedes Anrufs — Tagessummen wissen nur, dass es 120 waren, nicht ob
-- verteilt über acht Stunden oder gedrängt in zwei.
--
-- Nur der Check wird erweitert, keine neue Tabelle und keine neue Spalte:
-- die Ereignisse liegen alle am selben Ort, und jede Auswertung darüber
-- rechnet damit automatisch mit.
alter table call_events drop constraint if exists call_events_art_check;
alter table call_events add constraint call_events_art_check
  check (art in ('negativ', 'termin', 'anwahl'));

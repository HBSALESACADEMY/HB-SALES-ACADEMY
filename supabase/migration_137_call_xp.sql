-- Wie viel XP für einen Tag im Call Tracker schon vergeben wurde.
--
-- Ohne diesen Merker gäbe es nur zwei Möglichkeiten, und beide sind falsch:
-- entweder XP bei jedem Zählen erneut vergeben (dann sammelt ein Tag
-- unendlich viel), oder nur einmal am Tagesende (dann sieht man den
-- Fortschritt nicht, wenn er motivieren soll).
--
-- Stattdessen rechnet der Server den ANSPRUCH für den ganzen Tag und zahlt
-- die Differenz zu dem, was hier steht. Das ist auch nach einer Korrektur
-- richtig und lässt sich beliebig oft aufrufen.
alter table call_log_days add column if not exists xp_vergeben integer not null default 0;

comment on column call_log_days.xp_vergeben is
  'Bereits gutgeschriebenes XP dieses Tages. Der Server zahlt nur die Differenz zum Anspruch (lib/callXp.js).';

-- Eigene Zeitzone je Person.
--
-- Zeiten wurden bisher in der Zeitzone des jeweiligen GERÄTS dargestellt.
-- Steht die falsch — oder sitzt jemand im Ausland — zeigt die Academy
-- Termine zur falschen Uhrzeit an, ohne dass erkennbar wäre, woran es liegt.
--
-- Leer = automatisch, also weiterhin die Zeitzone des Geräts.
alter table profiles add column if not exists zeitzone text;

-- Merkt sich, wann jemand die Team-Ziele zuletzt angesehen hat.
--
-- Damit lässt sich in der Navigation ein Zähler anzeigen, sobald die
-- Teamleitung ein neues Wochenziel setzt — bisher erfuhr man davon nur,
-- wenn man zufällig auf "Mein Team" ging. Gleiches Muster wie
-- last_seen_community_at.
alter table profiles add column if not exists last_seen_team_goals_at timestamptz;

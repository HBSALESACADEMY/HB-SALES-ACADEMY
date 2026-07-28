-- Migration 25: bestehende (vor Migration 24 erstellte) Community-Beiträge
-- bleiben weiterhin global sichtbar, wie sie es vorher immer waren. Nur neu
-- erstellte Beiträge ab jetzt sind standardmäßig auf die eigene Organisation
-- beschränkt (visibility='org').
-- Einmalig im Supabase SQL Editor ausführen.

update community_posts
set visibility = 'global'
where created_at < now();

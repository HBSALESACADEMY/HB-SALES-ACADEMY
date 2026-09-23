-- Migration 36: Echtzeit-Updates aktivieren (Nachrichten, Community, Anfragen)
-- Einmalig im Supabase SQL Editor ausführen.
-- Aktiviert Supabase Realtime (Live-Updates per WebSocket) für die wichtigsten
-- Tabellen, damit Nachrichten, Community-Beiträge und Anfragen automatisch
-- erscheinen, ohne dass die Seite neu geladen werden muss.
-- Die DO-Blöcke machen das sicher wiederholbar ausführbar (kein Fehler, falls
-- eine Tabelle schon aktiviert ist).

do $$
begin
  begin
    alter publication supabase_realtime add table direct_messages;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table community_posts;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table community_comments;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table community_kudos;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table friendships;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table profiles;
  exception when duplicate_object then null;
  end;
end $$;

-- Migration 37: Lesebestätigungen in Echtzeit
-- Einmalig im Supabase SQL Editor ausführen.

do $$
begin
  begin
    alter publication supabase_realtime add table conversation_reads;
  exception when duplicate_object then null;
  end;
end $$;

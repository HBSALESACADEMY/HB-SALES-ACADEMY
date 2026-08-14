-- Automatisch generierte Zusatzkurse (nach bestandener Prüfung, siehe
-- lib/generatePersonalCourse.js) schlagen ihre Kernerkenntnis zusätzlich als
-- Wissensdatenbank-Eintrag vor ("Lawinen-Effekt": nicht nur der persönliche
-- Lernpfad, auch das geteilte Wissen wächst automatisch mit).
alter table kb_entries drop constraint if exists kb_entries_source_check;
alter table kb_entries add constraint kb_entries_source_check
  check (source in ('manual', 'ai_roleplay', 'ai_course'));

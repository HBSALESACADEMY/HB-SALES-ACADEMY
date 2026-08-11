-- Feature-Wunsch (User-Feedback): nach einer Prüfung sieht man nur den
-- Gesamt-Score (z.B. 85%), aber nicht dauerhaft nachvollziehbar, WARUM —
-- welcher Teil (MC/Fallstudie) wie viel beigetragen hat und was für 100%
-- konkret fehlt. exam_results speicherte bisher nur score/total/passed,
-- nicht die Aufschlüsselung — die ging nach dem einmaligen Ergebnis-Bildschirm
-- verloren. quiz_results (pro Modul) hatte das Detail (open_feedback) schon,
-- wurde aber nach dem ersten Anzeigen ebenfalls nirgends erneut angezeigt.
alter table exam_results add column if not exists mc_score integer;
alter table exam_results add column if not exists mc_total integer;
alter table exam_results add column if not exists capstone_score integer;
alter table exam_results add column if not exists capstone_feedback jsonb;

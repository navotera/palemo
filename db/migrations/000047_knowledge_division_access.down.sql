DROP INDEX IF EXISTS lessons_learned_division_access_idx;
DROP INDEX IF EXISTS decision_logs_division_access_idx;
DROP INDEX IF EXISTS meeting_notes_division_access_idx;
DROP INDEX IF EXISTS wiki_pages_division_access_idx;

ALTER TABLE lessons_learned DROP COLUMN IF EXISTS accessible_division_ids;
ALTER TABLE decision_logs DROP COLUMN IF EXISTS accessible_division_ids;
ALTER TABLE meeting_notes DROP COLUMN IF EXISTS accessible_division_ids;
ALTER TABLE wiki_pages DROP COLUMN IF EXISTS accessible_division_ids;

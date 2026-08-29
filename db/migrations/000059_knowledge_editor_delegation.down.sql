DROP INDEX IF EXISTS lessons_learned_editor_access_idx;
DROP INDEX IF EXISTS decision_logs_editor_access_idx;
DROP INDEX IF EXISTS meeting_notes_editor_access_idx;
DROP INDEX IF EXISTS wiki_pages_editor_access_idx;

ALTER TABLE lessons_learned DROP COLUMN IF EXISTS accessible_editor_user_ids;
ALTER TABLE decision_logs DROP COLUMN IF EXISTS accessible_editor_user_ids;
ALTER TABLE meeting_notes DROP COLUMN IF EXISTS accessible_editor_user_ids;
ALTER TABLE wiki_pages DROP COLUMN IF EXISTS accessible_editor_user_ids;

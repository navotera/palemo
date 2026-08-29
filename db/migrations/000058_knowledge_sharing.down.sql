DROP INDEX IF EXISTS lessons_learned_user_access_idx;
DROP INDEX IF EXISTS lessons_learned_team_access_idx;
DROP INDEX IF EXISTS decision_logs_user_access_idx;
DROP INDEX IF EXISTS decision_logs_team_access_idx;
DROP INDEX IF EXISTS meeting_notes_user_access_idx;
DROP INDEX IF EXISTS meeting_notes_team_access_idx;
DROP INDEX IF EXISTS wiki_pages_user_access_idx;
DROP INDEX IF EXISTS wiki_pages_team_access_idx;

ALTER TABLE lessons_learned DROP COLUMN IF EXISTS accessible_user_ids, DROP COLUMN IF EXISTS accessible_team_ids;
ALTER TABLE decision_logs DROP COLUMN IF EXISTS accessible_user_ids, DROP COLUMN IF EXISTS accessible_team_ids;
ALTER TABLE meeting_notes DROP COLUMN IF EXISTS accessible_user_ids, DROP COLUMN IF EXISTS accessible_team_ids;
ALTER TABLE wiki_pages DROP COLUMN IF EXISTS accessible_user_ids, DROP COLUMN IF EXISTS accessible_team_ids;

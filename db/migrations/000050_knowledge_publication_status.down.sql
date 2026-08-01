DROP INDEX IF EXISTS lessons_learned_personal_drafts_idx;
ALTER TABLE lessons_learned DROP COLUMN IF EXISTS published_at, DROP COLUMN IF EXISTS publication_status;

DROP INDEX IF EXISTS decision_logs_personal_drafts_idx;
ALTER TABLE decision_logs DROP COLUMN IF EXISTS published_at, DROP COLUMN IF EXISTS publication_status;

DROP INDEX IF EXISTS meeting_notes_personal_drafts_idx;
ALTER TABLE meeting_notes DROP COLUMN IF EXISTS published_at, DROP COLUMN IF EXISTS publication_status;

DROP INDEX IF EXISTS wiki_pages_personal_drafts_idx;
ALTER TABLE wiki_pages DROP COLUMN IF EXISTS published_at, DROP COLUMN IF EXISTS publication_status;

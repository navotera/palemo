ALTER TABLE lessons_learned DROP CONSTRAINT IF EXISTS lessons_learned_cover_pair_check, DROP COLUMN IF EXISTS cover_url, DROP COLUMN IF EXISTS cover_source;
ALTER TABLE decision_logs DROP CONSTRAINT IF EXISTS decision_logs_cover_pair_check, DROP COLUMN IF EXISTS cover_url, DROP COLUMN IF EXISTS cover_source;
ALTER TABLE meeting_notes DROP CONSTRAINT IF EXISTS meeting_notes_cover_pair_check, DROP COLUMN IF EXISTS cover_url, DROP COLUMN IF EXISTS cover_source;
ALTER TABLE wiki_pages DROP CONSTRAINT IF EXISTS wiki_pages_cover_pair_check, DROP COLUMN IF EXISTS cover_url, DROP COLUMN IF EXISTS cover_source;

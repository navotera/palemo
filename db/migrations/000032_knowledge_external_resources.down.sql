ALTER TABLE lessons_learned DROP COLUMN IF EXISTS external_resources;
ALTER TABLE decision_logs DROP COLUMN IF EXISTS external_resources;
ALTER TABLE meeting_notes DROP COLUMN IF EXISTS external_resources;
ALTER TABLE wiki_pages DROP COLUMN IF EXISTS external_resources;
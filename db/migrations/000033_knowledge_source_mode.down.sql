ALTER TABLE lessons_learned DROP COLUMN IF EXISTS knowledge_source_mode;
ALTER TABLE decision_logs DROP COLUMN IF EXISTS knowledge_source_mode;
ALTER TABLE meeting_notes DROP COLUMN IF EXISTS knowledge_source_mode;
ALTER TABLE wiki_pages DROP COLUMN IF EXISTS knowledge_source_mode;
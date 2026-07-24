DROP INDEX IF EXISTS idx_lessons_learned_knowledge_types;
DROP INDEX IF EXISTS idx_decision_logs_knowledge_types;
DROP INDEX IF EXISTS idx_meeting_notes_knowledge_types;
DROP INDEX IF EXISTS idx_wiki_pages_knowledge_types;
ALTER TABLE lessons_learned DROP COLUMN IF EXISTS knowledge_types;
ALTER TABLE decision_logs DROP COLUMN IF EXISTS knowledge_types;
ALTER TABLE meeting_notes DROP COLUMN IF EXISTS knowledge_types;
ALTER TABLE wiki_pages DROP COLUMN IF EXISTS knowledge_types;
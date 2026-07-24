ALTER TABLE wiki_pages ADD COLUMN IF NOT EXISTS knowledge_types text[] NOT NULL DEFAULT '{}';
ALTER TABLE meeting_notes ADD COLUMN IF NOT EXISTS knowledge_types text[] NOT NULL DEFAULT '{}';
ALTER TABLE decision_logs ADD COLUMN IF NOT EXISTS knowledge_types text[] NOT NULL DEFAULT '{}';
ALTER TABLE lessons_learned ADD COLUMN IF NOT EXISTS knowledge_types text[] NOT NULL DEFAULT '{}';

UPDATE wiki_pages wp SET knowledge_types = ARRAY[kt.slug] FROM knowledge_types kt WHERE wp.knowledge_type_id = kt.id AND cardinality(wp.knowledge_types) = 0;
UPDATE meeting_notes SET knowledge_types = ARRAY['meetings'] WHERE cardinality(knowledge_types) = 0;
UPDATE decision_logs SET knowledge_types = ARRAY['decisions'] WHERE cardinality(knowledge_types) = 0;
UPDATE lessons_learned SET knowledge_types = ARRAY['lessons'] WHERE cardinality(knowledge_types) = 0;

CREATE INDEX IF NOT EXISTS idx_wiki_pages_knowledge_types ON wiki_pages USING gin(knowledge_types);
CREATE INDEX IF NOT EXISTS idx_meeting_notes_knowledge_types ON meeting_notes USING gin(knowledge_types);
CREATE INDEX IF NOT EXISTS idx_decision_logs_knowledge_types ON decision_logs USING gin(knowledge_types);
CREATE INDEX IF NOT EXISTS idx_lessons_learned_knowledge_types ON lessons_learned USING gin(knowledge_types);
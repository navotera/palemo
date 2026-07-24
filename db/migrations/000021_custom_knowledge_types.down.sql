DROP INDEX IF EXISTS wiki_pages_knowledge_type_idx;
ALTER TABLE wiki_pages DROP COLUMN IF EXISTS knowledge_type_id;
ALTER TABLE knowledge_types DROP COLUMN IF EXISTS is_system;
ALTER TABLE knowledge_types ADD CONSTRAINT knowledge_types_slug_check CHECK (slug IN ('wiki','meetings','decisions','lessons'));
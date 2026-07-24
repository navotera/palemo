ALTER TABLE knowledge_types DROP CONSTRAINT IF EXISTS knowledge_types_slug_check;
ALTER TABLE knowledge_types ADD COLUMN is_system boolean NOT NULL DEFAULT false;
UPDATE knowledge_types SET is_system=true WHERE slug IN ('wiki','meetings','decisions','lessons');
ALTER TABLE wiki_pages ADD COLUMN knowledge_type_id uuid REFERENCES knowledge_types(id);
UPDATE wiki_pages w SET knowledge_type_id=k.id FROM knowledge_types k WHERE k.tenant_id=w.tenant_id AND k.slug='wiki';
CREATE INDEX wiki_pages_knowledge_type_idx ON wiki_pages(tenant_id,knowledge_type_id,updated_at DESC);
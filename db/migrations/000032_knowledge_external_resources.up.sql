ALTER TABLE wiki_pages ADD COLUMN IF NOT EXISTS external_resources jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE meeting_notes ADD COLUMN IF NOT EXISTS external_resources jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE decision_logs ADD COLUMN IF NOT EXISTS external_resources jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE lessons_learned ADD COLUMN IF NOT EXISTS external_resources jsonb NOT NULL DEFAULT '[]'::jsonb;
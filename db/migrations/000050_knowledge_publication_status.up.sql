ALTER TABLE wiki_pages
    ADD COLUMN publication_status text NOT NULL DEFAULT 'published'
        CHECK (publication_status IN ('draft', 'published')),
    ADD COLUMN published_at timestamptz;
UPDATE wiki_pages SET published_at = COALESCE(updated_at, created_at) WHERE publication_status = 'published';
CREATE INDEX wiki_pages_personal_drafts_idx ON wiki_pages(tenant_id, author_id, updated_at DESC)
    WHERE publication_status = 'draft' AND deleted_at IS NULL;

ALTER TABLE meeting_notes
    ADD COLUMN publication_status text NOT NULL DEFAULT 'published'
        CHECK (publication_status IN ('draft', 'published')),
    ADD COLUMN published_at timestamptz;
UPDATE meeting_notes SET published_at = COALESCE(updated_at, created_at) WHERE publication_status = 'published';
CREATE INDEX meeting_notes_personal_drafts_idx ON meeting_notes(tenant_id, author_id, updated_at DESC)
    WHERE publication_status = 'draft' AND deleted_at IS NULL;

ALTER TABLE decision_logs
    ADD COLUMN publication_status text NOT NULL DEFAULT 'published'
        CHECK (publication_status IN ('draft', 'published')),
    ADD COLUMN published_at timestamptz;
UPDATE decision_logs SET published_at = COALESCE(updated_at, created_at) WHERE publication_status = 'published';
CREATE INDEX decision_logs_personal_drafts_idx ON decision_logs(tenant_id, author_id, updated_at DESC)
    WHERE publication_status = 'draft' AND deleted_at IS NULL;

ALTER TABLE lessons_learned
    ADD COLUMN publication_status text NOT NULL DEFAULT 'published'
        CHECK (publication_status IN ('draft', 'published')),
    ADD COLUMN published_at timestamptz;
UPDATE lessons_learned SET published_at = COALESCE(updated_at, created_at) WHERE publication_status = 'published';
CREATE INDEX lessons_learned_personal_drafts_idx ON lessons_learned(tenant_id, author_id, updated_at DESC)
    WHERE publication_status = 'draft' AND deleted_at IS NULL;

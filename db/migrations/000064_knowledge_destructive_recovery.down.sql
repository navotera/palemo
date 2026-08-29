DROP INDEX IF EXISTS knowledge_versions_recovery_lookup_idx;

UPDATE knowledge_versions
SET source = 'manual', expires_at = NULL
WHERE source = 'recovery';

ALTER TABLE knowledge_versions
    DROP CONSTRAINT knowledge_versions_source_check,
    DROP CONSTRAINT knowledge_versions_source_date_check,
    DROP COLUMN content_hash,
    DROP COLUMN expires_at,
    ADD CONSTRAINT knowledge_versions_source_check
        CHECK (source IN ('automatic', 'manual')),
    ADD CONSTRAINT knowledge_versions_source_date_check CHECK (
        (source = 'automatic' AND snapshot_date IS NOT NULL)
        OR (source = 'manual' AND snapshot_date IS NULL)
    );

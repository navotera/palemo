ALTER TABLE knowledge_versions
    DROP CONSTRAINT knowledge_versions_source_check,
    DROP CONSTRAINT knowledge_versions_source_date_check,
    ADD COLUMN content_hash char(64),
    ADD COLUMN expires_at timestamptz,
    ADD CONSTRAINT knowledge_versions_source_check
        CHECK (source IN ('automatic', 'manual', 'recovery')),
    ADD CONSTRAINT knowledge_versions_source_date_check CHECK (
        (source = 'automatic' AND snapshot_date IS NOT NULL AND expires_at IS NULL)
        OR (source = 'manual' AND snapshot_date IS NULL AND expires_at IS NULL)
        OR (source = 'recovery' AND snapshot_date IS NULL AND expires_at IS NOT NULL AND content_hash IS NOT NULL)
    );

CREATE INDEX knowledge_versions_recovery_lookup_idx
    ON knowledge_versions (tenant_id, knowledge_id, content_hash, expires_at DESC)
    WHERE source = 'recovery' AND deleted_at IS NULL;

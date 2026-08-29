CREATE TABLE knowledge_versions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id),
    knowledge_id uuid NOT NULL,
    source text NOT NULL CHECK (source IN ('automatic', 'manual')),
    snapshot_date date,
    title text NOT NULL,
    content text NOT NULL DEFAULT '',
    actor_id uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz,
    CONSTRAINT knowledge_versions_source_date_check CHECK (
        (source = 'automatic' AND snapshot_date IS NOT NULL)
        OR (source = 'manual' AND snapshot_date IS NULL)
    ),
    CONSTRAINT knowledge_versions_tenant_actor_fk
        FOREIGN KEY (tenant_id, actor_id) REFERENCES users(tenant_id, id)
);

CREATE UNIQUE INDEX knowledge_versions_daily_automatic_uidx
    ON knowledge_versions (tenant_id, knowledge_id, snapshot_date)
    WHERE source = 'automatic';

CREATE INDEX knowledge_versions_history_idx
    ON knowledge_versions (tenant_id, knowledge_id, updated_at DESC)
    WHERE deleted_at IS NULL;

WITH daily_versions AS (
    SELECT DISTINCT ON (
        ae.tenant_id,
        ae.entity_id,
        (ae.created_at AT TIME ZONE current_setting('TimeZone'))::date
    )
        ae.tenant_id,
        ae.entity_id AS knowledge_id,
        (ae.created_at AT TIME ZONE current_setting('TimeZone'))::date AS snapshot_date,
        ae.actor_id,
        ae.after_json,
        ae.created_at
    FROM audit_events ae
    WHERE ae.entity_type = 'knowledge'
      AND ae.after_json IS NOT NULL
    ORDER BY
        ae.tenant_id,
        ae.entity_id,
        (ae.created_at AT TIME ZONE current_setting('TimeZone'))::date,
        ae.created_at DESC
)
INSERT INTO knowledge_versions (
    tenant_id, knowledge_id, source, snapshot_date, title, content, actor_id, created_at, updated_at
)
SELECT
    tenant_id,
    knowledge_id,
    'automatic',
    snapshot_date,
    COALESCE(after_json->>'title', ''),
    COALESCE(after_json->>'content', ''),
    actor_id,
    created_at,
    created_at
FROM daily_versions;

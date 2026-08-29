WITH daily_latest AS (
    SELECT DISTINCT ON (
        ae.tenant_id,
        ae.entity_id,
        (ae.created_at AT TIME ZONE current_setting('TimeZone'))::date
    )
        ae.tenant_id,
        ae.entity_id AS knowledge_id,
        (ae.created_at AT TIME ZONE current_setting('TimeZone'))::date AS snapshot_date,
        ae.actor_id,
        ae.after_json AS snapshot,
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
UPDATE knowledge_versions kv
SET
    title = COALESCE(daily_latest.snapshot->>'title', kv.title),
    content = COALESCE(daily_latest.snapshot->>'content', kv.content),
    actor_id = daily_latest.actor_id,
    created_at = daily_latest.created_at,
    updated_at = daily_latest.created_at
FROM daily_latest
WHERE kv.tenant_id = daily_latest.tenant_id
  AND kv.knowledge_id = daily_latest.knowledge_id
  AND kv.snapshot_date = daily_latest.snapshot_date
  AND kv.source = 'automatic';

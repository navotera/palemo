WITH daily_baselines AS (
    SELECT DISTINCT ON (
        ae.tenant_id,
        ae.entity_id,
        (ae.created_at AT TIME ZONE current_setting('TimeZone'))::date
    )
        ae.tenant_id,
        ae.entity_id AS knowledge_id,
        (ae.created_at AT TIME ZONE current_setting('TimeZone'))::date AS snapshot_date,
        ae.actor_id,
        COALESCE(ae.before_json, ae.after_json) AS snapshot,
        ae.created_at
    FROM audit_events ae
    WHERE ae.entity_type = 'knowledge'
      AND ae.after_json IS NOT NULL
    ORDER BY
        ae.tenant_id,
        ae.entity_id,
        (ae.created_at AT TIME ZONE current_setting('TimeZone'))::date,
        ae.created_at ASC
)
UPDATE knowledge_versions kv
SET
    title = COALESCE(daily_baselines.snapshot->>'title', kv.title),
    content = COALESCE(daily_baselines.snapshot->>'content', kv.content),
    actor_id = daily_baselines.actor_id,
    created_at = daily_baselines.created_at,
    updated_at = daily_baselines.created_at
FROM daily_baselines
WHERE kv.tenant_id = daily_baselines.tenant_id
  AND kv.knowledge_id = daily_baselines.knowledge_id
  AND kv.snapshot_date = daily_baselines.snapshot_date
  AND kv.source = 'automatic';

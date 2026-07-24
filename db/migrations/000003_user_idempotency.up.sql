CREATE TABLE user_idempotency_keys (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id),
    user_id uuid NOT NULL REFERENCES users(id),
    key text NOT NULL,
    request_hash text NOT NULL,
    response_status integer,
    response_snapshot_json jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
    UNIQUE (tenant_id, user_id, key)
);
CREATE INDEX user_idempotency_keys_tenant_id_idx ON user_idempotency_keys (tenant_id);
CREATE INDEX user_idempotency_keys_expires_at_idx ON user_idempotency_keys (expires_at);


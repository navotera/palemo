CREATE TABLE webhook_subscriptions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id),
    api_client_id uuid NOT NULL REFERENCES api_clients(id), event text NOT NULL,
    target_url text NOT NULL, secret text NOT NULL, is_active boolean NOT NULL DEFAULT true,
    consecutive_failures integer NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK (event IN ('project.created','project.status_changed','task.completed','milestone.completed','report.ready')),
    UNIQUE(api_client_id,event,target_url)
);
CREATE INDEX webhook_subscriptions_tenant_idx ON webhook_subscriptions(tenant_id,event,is_active);

CREATE TABLE webhook_deliveries (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id),
    subscription_id uuid NOT NULL REFERENCES webhook_subscriptions(id), event text NOT NULL,
    payload_json jsonb NOT NULL, attempt integer NOT NULL DEFAULT 1, status text NOT NULL DEFAULT 'pending',
    response_code integer, response_body text, next_attempt_at timestamptz, delivered_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK(status IN ('pending','delivered','failed','disabled'))
);
CREATE INDEX webhook_deliveries_retry_idx ON webhook_deliveries(status,next_attempt_at);

CREATE TABLE notifications (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id),
    recipient_id uuid NOT NULL REFERENCES users(id), channel text NOT NULL CHECK(channel IN ('email','dashboard')),
    template text NOT NULL, payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
    status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','sent','failed','read')),
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notifications_recipient_idx ON notifications(tenant_id,recipient_id,status,created_at DESC);

CREATE TABLE github_project_links (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id),
    project_id uuid NOT NULL REFERENCES projects(id), repository text NOT NULL,
    webhook_secret text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(tenant_id,repository), UNIQUE(tenant_id,project_id)
);
CREATE TABLE github_webhook_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id),
    link_id uuid NOT NULL REFERENCES github_project_links(id), delivery_id text NOT NULL,
    event_type text NOT NULL, payload_json jsonb NOT NULL, processed_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(link_id,delivery_id)
);

ALTER TABLE api_clients ADD COLUMN last_used_at timestamptz;
ALTER TABLE api_clients ADD COLUMN rate_limit_per_minute integer NOT NULL DEFAULT 120 CHECK(rate_limit_per_minute > 0);

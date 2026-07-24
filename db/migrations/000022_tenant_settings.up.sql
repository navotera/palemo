CREATE TABLE tenant_settings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) UNIQUE,
    knowledge_visible_type_limit integer NOT NULL DEFAULT 3 CHECK (knowledge_visible_type_limit BETWEEN 1 AND 10),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX tenant_settings_tenant_id_idx ON tenant_settings(tenant_id);
INSERT INTO tenant_settings(tenant_id) SELECT id FROM tenants ON CONFLICT (tenant_id) DO NOTHING;
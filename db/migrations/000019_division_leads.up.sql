CREATE TABLE division_leads (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id),
    division_id uuid NOT NULL REFERENCES divisions(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, division_id, user_id)
);
CREATE INDEX division_leads_tenant_id_idx ON division_leads (tenant_id);
CREATE INDEX division_leads_division_id_idx ON division_leads (division_id);
CREATE INDEX division_leads_user_id_idx ON division_leads (user_id);


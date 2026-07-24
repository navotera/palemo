CREATE TABLE reviews (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id),
    entity_type text NOT NULL CHECK (entity_type IN ('task','milestone','project')),
    entity_id uuid NOT NULL,
    reviewer_id uuid NOT NULL,
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','revision_requested')),
    notes text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT reviews_tenant_reviewer_fk FOREIGN KEY (tenant_id, reviewer_id) REFERENCES users(tenant_id,id)
);
CREATE INDEX reviews_tenant_entity_idx ON reviews(tenant_id, entity_type, entity_id);
CREATE INDEX reviews_tenant_reviewer_idx ON reviews(tenant_id, reviewer_id, status);

CREATE TABLE report_exports (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id),
    requested_by uuid NOT NULL REFERENCES users(id), report_type text NOT NULL,
    filters_json jsonb NOT NULL DEFAULT '{}'::jsonb,
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','ready','failed')),
    file_path text, created_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz
);
CREATE INDEX report_exports_tenant_idx ON report_exports(tenant_id, created_at DESC);

CREATE TABLE project_finish_attachments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id),
    project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    filename text NOT NULL,
    content_type text NOT NULL CHECK(content_type IN ('application/pdf','image/jpeg','image/png','image/webp')),
    size_bytes bigint NOT NULL CHECK(size_bytes > 0 AND size_bytes <= 10485760),
    content bytea NOT NULL,
    uploaded_by uuid REFERENCES users(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX project_finish_attachments_tenant_project_idx ON project_finish_attachments(tenant_id, project_id, created_at DESC);

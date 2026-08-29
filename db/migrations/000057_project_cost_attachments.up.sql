CREATE TABLE project_cost_attachments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id),
    project_id uuid NOT NULL,
    uploaded_by uuid NOT NULL,
    filename varchar(255) NOT NULL,
    content_type varchar(120) NOT NULL,
    size_bytes bigint NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 10485760),
    content bytea NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz NULL,
    CONSTRAINT project_cost_attachments_project_fk
        FOREIGN KEY (tenant_id, project_id) REFERENCES projects(tenant_id, id) ON DELETE CASCADE,
    CONSTRAINT project_cost_attachments_uploader_fk
        FOREIGN KEY (tenant_id, uploaded_by) REFERENCES users(tenant_id, id)
);

CREATE INDEX project_cost_attachments_tenant_project_idx
    ON project_cost_attachments (tenant_id, project_id, created_at DESC)
    WHERE deleted_at IS NULL;

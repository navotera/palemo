CREATE TABLE project_people (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id),
    project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES users(id),
    project_role text NOT NULL CHECK(project_role IN ('member','reviewer')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(tenant_id, project_id, user_id, project_role)
);
CREATE INDEX project_people_tenant_project_idx ON project_people(tenant_id, project_id, project_role);
CREATE INDEX project_people_tenant_user_idx ON project_people(tenant_id, user_id);

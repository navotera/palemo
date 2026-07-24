ALTER TABLE projects
    ADD COLUMN project_type text NOT NULL DEFAULT 'operational'
    CHECK (project_type IN ('operational', 'technical', 'rnd'));

CREATE INDEX projects_tenant_type_idx ON projects (tenant_id, project_type)
    WHERE deleted_at IS NULL;

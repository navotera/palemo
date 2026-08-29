ALTER TABLE project_templates
    ADD COLUMN IF NOT EXISTS project_type text NOT NULL DEFAULT 'operational',
    ADD COLUMN IF NOT EXISTS description text,
    ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'tenant',
    ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES users(id),
    ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

ALTER TABLE project_templates
    ADD CONSTRAINT project_templates_project_type_check
        CHECK (char_length(btrim(project_type)) BETWEEN 1 AND 40),
    ADD CONSTRAINT project_templates_visibility_check
        CHECK (visibility IN ('private', 'team', 'tenant'));

CREATE INDEX project_templates_tenant_active_idx
    ON project_templates (tenant_id, updated_at DESC)
    WHERE deleted_at IS NULL;

CREATE INDEX project_templates_source_project_idx
    ON project_templates (tenant_id, source_project_id)
    WHERE source_project_id IS NOT NULL;

CREATE TABLE project_template_versions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id),
    project_template_id uuid NOT NULL REFERENCES project_templates(id),
    version integer NOT NULL CHECK (version > 0),
    project_type text NOT NULL,
    structure_json jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_by uuid REFERENCES users(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, project_template_id, version)
);

CREATE INDEX project_template_versions_tenant_template_idx
    ON project_template_versions (tenant_id, project_template_id, version DESC);

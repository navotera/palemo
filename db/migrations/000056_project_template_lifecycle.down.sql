DROP INDEX IF EXISTS project_template_versions_tenant_template_idx;
DROP TABLE IF EXISTS project_template_versions;
DROP INDEX IF EXISTS project_templates_source_project_idx;
DROP INDEX IF EXISTS project_templates_tenant_active_idx;
ALTER TABLE project_templates
    DROP CONSTRAINT IF EXISTS project_templates_project_type_check,
    DROP CONSTRAINT IF EXISTS project_templates_visibility_check,
    DROP COLUMN IF EXISTS deleted_at,
    DROP COLUMN IF EXISTS created_by,
    DROP COLUMN IF EXISTS version,
    DROP COLUMN IF EXISTS visibility,
    DROP COLUMN IF EXISTS description,
    DROP COLUMN IF EXISTS project_type;

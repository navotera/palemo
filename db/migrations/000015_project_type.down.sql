DROP INDEX IF EXISTS projects_tenant_type_idx;
ALTER TABLE projects DROP COLUMN IF EXISTS project_type;

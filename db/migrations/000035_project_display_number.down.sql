DROP INDEX IF EXISTS projects_tenant_display_number_unique;
ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_display_number_positive;
ALTER TABLE projects DROP COLUMN IF EXISTS display_number;
DROP INDEX IF EXISTS projects_tenant_created_by_idx;
ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_tenant_creator_fk;
ALTER TABLE projects DROP COLUMN IF EXISTS created_by;

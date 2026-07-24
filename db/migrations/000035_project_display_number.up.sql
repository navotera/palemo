ALTER TABLE projects ADD COLUMN display_number integer;

WITH numbered AS (
    SELECT id, row_number() OVER (PARTITION BY tenant_id ORDER BY created_at, id)::integer AS number
    FROM projects
)
UPDATE projects p SET display_number = numbered.number
FROM numbered WHERE numbered.id = p.id;

ALTER TABLE projects ALTER COLUMN display_number SET NOT NULL;
ALTER TABLE projects ADD CONSTRAINT projects_display_number_positive CHECK (display_number > 0);
CREATE UNIQUE INDEX projects_tenant_display_number_unique ON projects (tenant_id, display_number);
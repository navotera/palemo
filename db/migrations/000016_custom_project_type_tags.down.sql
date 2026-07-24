DROP INDEX IF EXISTS projects_tags_idx;
ALTER TABLE projects DROP COLUMN IF EXISTS tags;
UPDATE projects
SET project_type = 'operational'
WHERE project_type NOT IN ('operational', 'technical', 'rnd');
ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_project_type_check;
ALTER TABLE projects
    ADD CONSTRAINT projects_project_type_check
        CHECK (project_type IN ('operational', 'technical', 'rnd'));

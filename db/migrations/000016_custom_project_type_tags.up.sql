ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_project_type_check;
ALTER TABLE projects
    ADD CONSTRAINT projects_project_type_check
        CHECK (char_length(btrim(project_type)) BETWEEN 1 AND 40),
    ADD COLUMN tags text[] NOT NULL DEFAULT '{}';

CREATE INDEX projects_tags_idx ON projects USING gin (tags);

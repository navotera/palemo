DROP INDEX IF EXISTS projects_preliminary_note_template_id_idx;
ALTER TABLE projects
    DROP COLUMN IF EXISTS preliminary_notes,
    DROP COLUMN IF EXISTS preliminary_note_template_id;
DROP TABLE IF EXISTS preliminary_note_templates;

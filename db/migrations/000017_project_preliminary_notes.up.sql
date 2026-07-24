CREATE TABLE preliminary_note_templates (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id),
    name text NOT NULL,
    content_markdown text NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, name)
);
CREATE INDEX preliminary_note_templates_tenant_id_idx
    ON preliminary_note_templates (tenant_id);

ALTER TABLE projects
    ADD COLUMN preliminary_note_template_id uuid REFERENCES preliminary_note_templates(id),
    ADD COLUMN preliminary_notes text NOT NULL DEFAULT '';
CREATE INDEX projects_preliminary_note_template_id_idx
    ON projects (preliminary_note_template_id);

INSERT INTO preliminary_note_templates (tenant_id, name, content_markdown)
SELECT id, 'Standard Project Brief',
       E'## Objective\n\nDescribe the project objective.\n\n## Scope\n\n- Included\n- Excluded\n\n## Initial checklist\n\n- [ ] Confirm stakeholders\n- [ ] Confirm delivery constraints'
FROM tenants
ON CONFLICT (tenant_id, name) DO NOTHING;

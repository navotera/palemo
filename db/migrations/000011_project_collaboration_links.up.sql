CREATE TABLE project_divisions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id),
    project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    division_id uuid NOT NULL REFERENCES divisions(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(tenant_id, project_id, division_id)
);
CREATE INDEX project_divisions_tenant_project_idx ON project_divisions(tenant_id, project_id);
CREATE INDEX project_divisions_tenant_division_idx ON project_divisions(tenant_id, division_id);

CREATE TABLE project_knowledge_links (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id),
    project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    wiki_page_id uuid NOT NULL REFERENCES wiki_pages(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(tenant_id, project_id, wiki_page_id)
);
CREATE INDEX project_knowledge_links_tenant_project_idx ON project_knowledge_links(tenant_id, project_id);
CREATE INDEX project_knowledge_links_tenant_page_idx ON project_knowledge_links(tenant_id, wiki_page_id);

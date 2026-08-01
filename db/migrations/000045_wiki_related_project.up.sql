ALTER TABLE wiki_pages
  ADD COLUMN related_project_id uuid REFERENCES projects(id);

CREATE INDEX wiki_pages_tenant_related_project_idx
  ON wiki_pages (tenant_id, related_project_id)
  WHERE related_project_id IS NOT NULL;

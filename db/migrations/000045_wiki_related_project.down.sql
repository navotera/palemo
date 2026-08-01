DROP INDEX IF EXISTS wiki_pages_tenant_related_project_idx;

ALTER TABLE wiki_pages
  DROP COLUMN IF EXISTS related_project_id;

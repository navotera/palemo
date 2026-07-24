DELETE FROM project_finish_attachments WHERE evidence_type='url';
ALTER TABLE project_finish_attachments DROP CONSTRAINT IF EXISTS project_finish_evidence_shape;
ALTER TABLE project_finish_attachments DROP COLUMN IF EXISTS external_url;
ALTER TABLE project_finish_attachments DROP COLUMN IF EXISTS evidence_type;
ALTER TABLE project_finish_attachments ALTER COLUMN content_type SET NOT NULL;
ALTER TABLE project_finish_attachments ALTER COLUMN size_bytes SET NOT NULL;
ALTER TABLE project_finish_attachments ALTER COLUMN content SET NOT NULL;
ALTER TABLE project_finish_attachments ADD CONSTRAINT project_finish_attachments_content_type_check CHECK(content_type IN('application/pdf','image/jpeg','image/png','image/webp'));
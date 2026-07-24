ALTER TABLE project_finish_attachments DROP CONSTRAINT IF EXISTS project_finish_attachments_content_type_check;
ALTER TABLE project_finish_attachments ALTER COLUMN content_type DROP NOT NULL;
ALTER TABLE project_finish_attachments ALTER COLUMN size_bytes DROP NOT NULL;
ALTER TABLE project_finish_attachments ALTER COLUMN content DROP NOT NULL;
ALTER TABLE project_finish_attachments ADD COLUMN evidence_type text NOT NULL DEFAULT 'file' CHECK(evidence_type IN('file','url'));
ALTER TABLE project_finish_attachments ADD COLUMN external_url text;
ALTER TABLE project_finish_attachments ADD CONSTRAINT project_finish_evidence_shape CHECK(
 (evidence_type='file' AND content IS NOT NULL AND content_type IN('application/pdf','image/jpeg','image/png','image/webp') AND size_bytes>0 AND size_bytes<=10485760 AND external_url IS NULL)
 OR (evidence_type='url' AND content IS NULL AND content_type IS NULL AND size_bytes IS NULL AND external_url IS NOT NULL)
);
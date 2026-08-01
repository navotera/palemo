CREATE TABLE activity_execution_notes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES tenants(id),
 task_id uuid NOT NULL,
 author_id uuid NOT NULL,
 content_markdown text NOT NULL CHECK (char_length(btrim(content_markdown)) BETWEEN 1 AND 20000),
 occurred_at timestamptz NOT NULL DEFAULT now(),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT activity_execution_notes_tenant_task_fk
   FOREIGN KEY (tenant_id, task_id) REFERENCES tasks (tenant_id, id),
 CONSTRAINT activity_execution_notes_tenant_author_fk
   FOREIGN KEY (tenant_id, author_id) REFERENCES users (tenant_id, id)
);
CREATE INDEX activity_execution_notes_task_timeline_idx ON activity_execution_notes (tenant_id, task_id, occurred_at DESC, created_at DESC);

CREATE TABLE activity_realizations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES tenants(id),
 task_id uuid NOT NULL,
 realized_date date,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (tenant_id, task_id),
 CONSTRAINT activity_realizations_tenant_task_fk
   FOREIGN KEY (tenant_id, task_id) REFERENCES tasks (tenant_id, id)
);
CREATE INDEX activity_realizations_task_idx ON activity_realizations (tenant_id, task_id);

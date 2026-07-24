CREATE TABLE simulation_batches (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id),
 status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','deleted')),
 created_by uuid REFERENCES users(id), deleted_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX simulation_batches_tenant_status_idx ON simulation_batches(tenant_id,status);
CREATE TABLE simulation_records (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id),
 batch_id uuid NOT NULL REFERENCES simulation_batches(id), entity_type text NOT NULL, entity_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(batch_id,entity_type,entity_id)
);
CREATE INDEX simulation_records_batch_idx ON simulation_records(tenant_id,batch_id);
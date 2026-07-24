ALTER TABLE knowledge_workspaces ADD COLUMN simulation_batch_id uuid REFERENCES simulation_batches(id);
ALTER TABLE knowledge_workspaces ADD COLUMN deleted_at timestamptz;
CREATE INDEX knowledge_workspaces_simulation_batch_idx ON knowledge_workspaces(tenant_id,simulation_batch_id) WHERE simulation_batch_id IS NOT NULL;
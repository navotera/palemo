DROP INDEX IF EXISTS knowledge_workspaces_simulation_batch_idx;
ALTER TABLE knowledge_workspaces DROP COLUMN IF EXISTS deleted_at;
ALTER TABLE knowledge_workspaces DROP COLUMN IF EXISTS simulation_batch_id;
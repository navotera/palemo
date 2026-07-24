ALTER TABLE tenant_settings ADD COLUMN workspace_tab_limit integer NOT NULL DEFAULT 8 CHECK (workspace_tab_limit BETWEEN 1 AND 12);
CREATE TABLE user_workspace_states (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id),
 user_id uuid NOT NULL REFERENCES users(id), tabs jsonb NOT NULL DEFAULT '[]'::jsonb,
 active_tab_id text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,user_id)
);
CREATE INDEX user_workspace_states_tenant_user_idx ON user_workspace_states(tenant_id,user_id);
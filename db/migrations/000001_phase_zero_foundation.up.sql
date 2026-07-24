CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE tenants (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE divisions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id),
    parent_division_id uuid REFERENCES divisions(id),
    name text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX divisions_tenant_id_idx ON divisions (tenant_id);
CREATE INDEX divisions_parent_division_id_idx ON divisions (parent_division_id);

CREATE TABLE teams (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id),
    division_id uuid NOT NULL REFERENCES divisions(id),
    name text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX teams_tenant_id_idx ON teams (tenant_id);
CREATE INDEX teams_division_id_idx ON teams (division_id);

CREATE TABLE users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id),
    team_id uuid REFERENCES teams(id),
    external_id text,
    name text NOT NULL,
    email text NOT NULL,
    role text NOT NULL CHECK (role IN ('admin', 'manager', 'supervisor', 'staff')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, external_id),
    UNIQUE (tenant_id, email)
);
CREATE INDEX users_tenant_id_idx ON users (tenant_id);
CREATE INDEX users_team_id_idx ON users (team_id);

CREATE TABLE role_mappings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id),
    external_role text NOT NULL,
    npms_role text NOT NULL CHECK (npms_role IN ('admin', 'manager', 'supervisor', 'staff')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, external_role)
);
CREATE INDEX role_mappings_tenant_id_idx ON role_mappings (tenant_id);

CREATE TABLE projects (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id),
    team_id uuid NOT NULL REFERENCES teams(id),
    parent_project_id uuid REFERENCES projects(id),
    name text NOT NULL,
    status text NOT NULL DEFAULT 'planning' CHECK (status IN ('planning', 'active', 'on_hold', 'review', 'done', 'archived')),
    source text,
    source_ref text,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz
);
CREATE INDEX projects_tenant_id_idx ON projects (tenant_id);
CREATE INDEX projects_team_id_idx ON projects (team_id);
CREATE INDEX projects_parent_project_id_idx ON projects (parent_project_id);
CREATE UNIQUE INDEX projects_source_ref_unique_idx ON projects (tenant_id, source, source_ref)
    WHERE source IS NOT NULL AND source_ref IS NOT NULL AND deleted_at IS NULL;

CREATE TABLE tasks (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id),
    project_id uuid NOT NULL REFERENCES projects(id),
    assignee_id uuid REFERENCES users(id),
    title text NOT NULL,
    board_column text NOT NULL DEFAULT 'todo',
    position integer NOT NULL DEFAULT 0 CHECK (position >= 0),
    due_date date,
    estimated_hours numeric(8,2) CHECK (estimated_hours IS NULL OR estimated_hours >= 0),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz
);
CREATE INDEX tasks_tenant_id_idx ON tasks (tenant_id);
CREATE INDEX tasks_project_id_idx ON tasks (project_id);
CREATE INDEX tasks_assignee_id_idx ON tasks (assignee_id);
CREATE INDEX tasks_board_position_idx ON tasks (tenant_id, project_id, board_column, position);

CREATE TABLE checklist_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id),
    task_id uuid NOT NULL REFERENCES tasks(id),
    label text NOT NULL,
    is_done boolean NOT NULL DEFAULT false,
    item_order integer NOT NULL DEFAULT 0 CHECK (item_order >= 0),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX checklist_items_tenant_id_idx ON checklist_items (tenant_id);
CREATE INDEX checklist_items_task_id_idx ON checklist_items (task_id);

CREATE TABLE api_clients (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id),
    name text NOT NULL,
    client_id text NOT NULL UNIQUE,
    client_secret_hash text NOT NULL,
    scopes text[] NOT NULL DEFAULT '{}',
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX api_clients_tenant_id_idx ON api_clients (tenant_id);

CREATE TABLE idempotency_keys (
    key text NOT NULL,
    api_client_id uuid NOT NULL REFERENCES api_clients(id),
    tenant_id uuid NOT NULL REFERENCES tenants(id),
    request_hash text NOT NULL,
    response_status integer,
    response_snapshot_json jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
    PRIMARY KEY (api_client_id, key)
);
CREATE INDEX idempotency_keys_tenant_id_idx ON idempotency_keys (tenant_id);
CREATE INDEX idempotency_keys_expires_at_idx ON idempotency_keys (expires_at);

CREATE TABLE audit_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id),
    actor_id uuid REFERENCES users(id),
    actor_source text NOT NULL,
    action text NOT NULL,
    entity_type text NOT NULL,
    entity_id uuid NOT NULL,
    before_json jsonb,
    after_json jsonb,
    request_id uuid,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_events_tenant_id_idx ON audit_events (tenant_id);
CREATE INDEX audit_events_entity_timeline_idx ON audit_events (tenant_id, entity_type, entity_id, created_at DESC);
CREATE INDEX audit_events_actor_id_idx ON audit_events (actor_id);

CREATE FUNCTION prevent_audit_event_mutation() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'audit_events are append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_events_no_update_or_delete BEFORE UPDATE OR DELETE ON audit_events
FOR EACH ROW EXECUTE FUNCTION prevent_audit_event_mutation();


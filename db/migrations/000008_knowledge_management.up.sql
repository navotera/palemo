CREATE TABLE knowledge_workspaces (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id),
    team_id uuid REFERENCES teams(id), name text NOT NULL, description text,
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(tenant_id,name)
);
CREATE INDEX knowledge_workspaces_tenant_idx ON knowledge_workspaces(tenant_id,team_id);

CREATE TABLE wiki_pages (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id),
    workspace_id uuid NOT NULL REFERENCES knowledge_workspaces(id), parent_page_id uuid REFERENCES wiki_pages(id),
    team_id uuid REFERENCES teams(id), title text NOT NULL, content text NOT NULL DEFAULT '',
    author_id uuid NOT NULL REFERENCES users(id), tags text[] NOT NULL DEFAULT '{}',
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz
);
CREATE INDEX wiki_pages_tenant_parent_idx ON wiki_pages(tenant_id,parent_page_id);
CREATE INDEX wiki_pages_search_idx ON wiki_pages USING gin(to_tsvector('simple',title||' '||content));

CREATE TABLE meeting_notes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id),
    workspace_id uuid NOT NULL REFERENCES knowledge_workspaces(id), team_id uuid REFERENCES teams(id),
    title text NOT NULL, content text NOT NULL DEFAULT '', meeting_at timestamptz,
    author_id uuid NOT NULL REFERENCES users(id), tags text[] NOT NULL DEFAULT '{}',
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz
);
CREATE INDEX meeting_notes_tenant_idx ON meeting_notes(tenant_id,meeting_at DESC);

CREATE TABLE decision_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id),
    workspace_id uuid NOT NULL REFERENCES knowledge_workspaces(id), team_id uuid REFERENCES teams(id),
    title text NOT NULL, content text NOT NULL DEFAULT '', decision_status text NOT NULL DEFAULT 'accepted' CHECK(decision_status IN('proposed','accepted','superseded')),
    author_id uuid NOT NULL REFERENCES users(id), tags text[] NOT NULL DEFAULT '{}',
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz
);
CREATE INDEX decision_logs_tenant_idx ON decision_logs(tenant_id,created_at DESC);

CREATE TABLE lessons_learned (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id),
    workspace_id uuid NOT NULL REFERENCES knowledge_workspaces(id), team_id uuid REFERENCES teams(id), project_id uuid REFERENCES projects(id),
    title text NOT NULL, content text NOT NULL DEFAULT '', outcome text,
    author_id uuid NOT NULL REFERENCES users(id), tags text[] NOT NULL DEFAULT '{}',
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz
);
CREATE INDEX lessons_learned_tenant_idx ON lessons_learned(tenant_id,project_id,created_at DESC);

ALTER TABLE knowledge_workspaces ADD CONSTRAINT knowledge_workspaces_tenant_id_id_unique UNIQUE(tenant_id,id);
ALTER TABLE wiki_pages ADD CONSTRAINT wiki_pages_tenant_workspace_fk FOREIGN KEY(tenant_id,workspace_id) REFERENCES knowledge_workspaces(tenant_id,id);

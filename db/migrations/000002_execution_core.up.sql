CREATE TABLE portfolios (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id),
    team_id uuid NOT NULL REFERENCES teams(id), name text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX portfolios_tenant_id_idx ON portfolios (tenant_id);

CREATE TABLE project_templates (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id),
    name text NOT NULL, source_project_id uuid REFERENCES projects(id), structure_json jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX project_templates_tenant_id_idx ON project_templates (tenant_id);

ALTER TABLE projects ADD COLUMN portfolio_id uuid REFERENCES portfolios(id);
ALTER TABLE projects ADD COLUMN template_id uuid REFERENCES project_templates(id);
CREATE INDEX projects_portfolio_id_idx ON projects (portfolio_id);

CREATE TABLE milestones (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id),
    project_id uuid NOT NULL REFERENCES projects(id), name text NOT NULL,
    status text NOT NULL DEFAULT 'planning' CHECK (status IN ('planning','active','done')),
    due_date date, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX milestones_tenant_id_idx ON milestones (tenant_id);
CREATE INDEX milestones_project_id_idx ON milestones (project_id);

CREATE TABLE sprints (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id),
    milestone_id uuid NOT NULL REFERENCES milestones(id), name text NOT NULL,
    starts_at date, ends_at date, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sprints_tenant_id_idx ON sprints (tenant_id);

ALTER TABLE tasks ADD COLUMN milestone_id uuid REFERENCES milestones(id);
ALTER TABLE tasks ADD COLUMN sprint_id uuid REFERENCES sprints(id);

CREATE TABLE time_entries (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id),
    task_id uuid NOT NULL REFERENCES tasks(id), user_id uuid NOT NULL REFERENCES users(id),
    started_at timestamptz NOT NULL DEFAULT now(), ended_at timestamptz,
    duration_seconds integer CHECK (duration_seconds IS NULL OR duration_seconds >= 0),
    auto_closed boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX time_entries_tenant_id_idx ON time_entries (tenant_id);
CREATE INDEX time_entries_task_id_idx ON time_entries (task_id);
CREATE UNIQUE INDEX time_entries_one_active_per_user_idx ON time_entries (tenant_id, user_id) WHERE ended_at IS NULL;

CREATE MATERIALIZED VIEW daily_time_totals AS
SELECT tenant_id, user_id, task_id, date_trunc('day', started_at) AS work_day,
       sum(duration_seconds) FILTER (WHERE NOT auto_closed) AS verified_duration_seconds
FROM time_entries WHERE ended_at IS NOT NULL GROUP BY tenant_id, user_id, task_id, date_trunc('day', started_at);
CREATE UNIQUE INDEX daily_time_totals_unique_idx ON daily_time_totals (tenant_id, user_id, task_id, work_day);


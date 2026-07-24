ALTER TABLE time_entries DROP CONSTRAINT IF EXISTS time_entries_tenant_user_fk;
ALTER TABLE time_entries DROP CONSTRAINT IF EXISTS time_entries_tenant_task_fk;
ALTER TABLE milestones DROP CONSTRAINT IF EXISTS milestones_tenant_project_fk;
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_tenant_assignee_fk;
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_tenant_project_fk;
ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_tenant_parent_fk;
ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_tenant_team_fk;
ALTER TABLE milestones DROP CONSTRAINT IF EXISTS milestones_tenant_id_id_unique;
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_tenant_id_id_unique;
ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_tenant_id_id_unique;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_tenant_id_id_unique;
ALTER TABLE teams DROP CONSTRAINT IF EXISTS teams_tenant_id_id_unique;


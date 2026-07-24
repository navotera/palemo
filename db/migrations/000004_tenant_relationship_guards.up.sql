ALTER TABLE teams ADD CONSTRAINT teams_tenant_id_id_unique UNIQUE (tenant_id, id);
ALTER TABLE users ADD CONSTRAINT users_tenant_id_id_unique UNIQUE (tenant_id, id);
ALTER TABLE projects ADD CONSTRAINT projects_tenant_id_id_unique UNIQUE (tenant_id, id);
ALTER TABLE tasks ADD CONSTRAINT tasks_tenant_id_id_unique UNIQUE (tenant_id, id);
ALTER TABLE milestones ADD CONSTRAINT milestones_tenant_id_id_unique UNIQUE (tenant_id, id);

ALTER TABLE projects ADD CONSTRAINT projects_tenant_team_fk
    FOREIGN KEY (tenant_id, team_id) REFERENCES teams (tenant_id, id);
ALTER TABLE projects ADD CONSTRAINT projects_tenant_parent_fk
    FOREIGN KEY (tenant_id, parent_project_id) REFERENCES projects (tenant_id, id);
ALTER TABLE tasks ADD CONSTRAINT tasks_tenant_project_fk
    FOREIGN KEY (tenant_id, project_id) REFERENCES projects (tenant_id, id);
ALTER TABLE tasks ADD CONSTRAINT tasks_tenant_assignee_fk
    FOREIGN KEY (tenant_id, assignee_id) REFERENCES users (tenant_id, id);
ALTER TABLE milestones ADD CONSTRAINT milestones_tenant_project_fk
    FOREIGN KEY (tenant_id, project_id) REFERENCES projects (tenant_id, id);
ALTER TABLE time_entries ADD CONSTRAINT time_entries_tenant_task_fk
    FOREIGN KEY (tenant_id, task_id) REFERENCES tasks (tenant_id, id);
ALTER TABLE time_entries ADD CONSTRAINT time_entries_tenant_user_fk
    FOREIGN KEY (tenant_id, user_id) REFERENCES users (tenant_id, id);


ALTER TABLE projects ADD COLUMN created_by uuid;

UPDATE projects AS p
SET created_by = COALESCE(
  (
    SELECT ae.actor_id
    FROM audit_events AS ae
    WHERE ae.tenant_id = p.tenant_id
      AND ae.entity_type = 'project'
      AND ae.entity_id = p.id
      AND ae.action = 'create'
      AND ae.actor_id IS NOT NULL
    ORDER BY ae.created_at ASC
    LIMIT 1
  ),
  (
    SELECT u.id
    FROM users AS u
    WHERE u.tenant_id = p.tenant_id
    ORDER BY CASE WHEN u.role = 'admin' THEN 0 ELSE 1 END, u.created_at ASC
    LIMIT 1
  )
);

ALTER TABLE projects ALTER COLUMN created_by SET NOT NULL;
ALTER TABLE projects ADD CONSTRAINT projects_tenant_creator_fk
  FOREIGN KEY (tenant_id, created_by) REFERENCES users (tenant_id, id);
CREATE INDEX projects_tenant_created_by_idx ON projects (tenant_id, created_by);

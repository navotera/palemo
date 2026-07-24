INSERT INTO knowledge_types(id,tenant_id,slug,label,description,color,is_active,is_system,sort_order,created_at,updated_at)
SELECT gen_random_uuid(), t.id, 'project_preliminary_notes', 'Project Preliminary Notes',
       'Reusable preliminary notes that can be loaded while creating a project',
       '#6f63b6', true, true, 50, now(), now()
FROM tenants t
ON CONFLICT (tenant_id,slug) DO UPDATE SET
 label=EXCLUDED.label, description=EXCLUDED.description, is_system=true, updated_at=now();
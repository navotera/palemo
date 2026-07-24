CREATE EXTENSION IF NOT EXISTS ltree;

ALTER TABLE wiki_pages ADD COLUMN path ltree;
ALTER TABLE wiki_pages ADD COLUMN version integer NOT NULL DEFAULT 1;
CREATE INDEX wiki_pages_path_idx ON wiki_pages USING gist(path);
UPDATE wiki_pages SET path=text2ltree(replace(id::text,'-','_')) WHERE path IS NULL;
ALTER TABLE wiki_pages ALTER COLUMN path SET NOT NULL;
CREATE TABLE wiki_page_versions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id),
    page_id uuid NOT NULL REFERENCES wiki_pages(id), version integer NOT NULL,
    title text NOT NULL, content text NOT NULL, tags text[] NOT NULL, author_id uuid NOT NULL REFERENCES users(id),
    created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(page_id,version)
);
CREATE FUNCTION maintain_wiki_page_path() RETURNS trigger AS $$
DECLARE parent_path ltree;
BEGIN
    IF NEW.parent_page_id IS NULL THEN NEW.path:=text2ltree(replace(NEW.id::text,'-','_'));
    ELSE SELECT path INTO parent_path FROM wiki_pages WHERE tenant_id=NEW.tenant_id AND id=NEW.parent_page_id;
         IF parent_path IS NULL OR nlevel(parent_path)>=5 THEN RAISE EXCEPTION 'invalid parent or wiki nesting exceeds 5 levels'; END IF;
         NEW.path:=parent_path||text2ltree(replace(NEW.id::text,'-','_'));
    END IF;
    IF TG_OP='UPDATE' AND (NEW.title,NEW.content,NEW.tags) IS DISTINCT FROM (OLD.title,OLD.content,OLD.tags) THEN
        INSERT INTO wiki_page_versions(tenant_id,page_id,version,title,content,tags,author_id)
        VALUES(OLD.tenant_id,OLD.id,OLD.version,OLD.title,OLD.content,OLD.tags,OLD.author_id);
        NEW.version:=OLD.version+1;
    END IF;
    RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER wiki_pages_path_version BEFORE INSERT OR UPDATE ON wiki_pages FOR EACH ROW EXECUTE FUNCTION maintain_wiki_page_path();

ALTER TABLE meeting_notes ADD COLUMN attendees uuid[] NOT NULL DEFAULT '{}';
ALTER TABLE meeting_notes ADD COLUMN related_project_id uuid REFERENCES projects(id);
ALTER TABLE decision_logs ADD COLUMN decision_date date;
ALTER TABLE decision_logs ADD COLUMN context text;
ALTER TABLE decision_logs ADD COLUMN decision text;
ALTER TABLE decision_logs ADD COLUMN consequences text;
ALTER TABLE decision_logs ADD COLUMN related_project_id uuid REFERENCES projects(id);
ALTER TABLE lessons_learned ADD COLUMN category text CHECK(category IN('process','technical','communication'));

CREATE TABLE sop_repository (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), workspace_id uuid NOT NULL REFERENCES knowledge_workspaces(id),
    team_id uuid REFERENCES teams(id), title text NOT NULL, description text, steps jsonb NOT NULL,
    version integer NOT NULL DEFAULT 1, author_id uuid NOT NULL REFERENCES users(id), is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK(jsonb_typeof(steps)='array')
);
CREATE TABLE sop_triggers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), sop_id uuid NOT NULL REFERENCES sop_repository(id),
    trigger_type text NOT NULL CHECK(trigger_type IN('project_created','task_type_matched','manual')),
    condition_json jsonb NOT NULL DEFAULT '{}', is_active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE checklist_items ADD COLUMN sop_id uuid REFERENCES sop_repository(id);
ALTER TABLE checklist_items ADD COLUMN sop_version integer;

CREATE TABLE automation_rules (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), name text NOT NULL,
    trigger_event text NOT NULL, condition_json jsonb NOT NULL DEFAULT '{}',
    action_type text NOT NULL CHECK(action_type IN('change_status','send_notification','create_task','assign_review')),
    action_config_json jsonb NOT NULL DEFAULT '{}', is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE automation_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), event text NOT NULL,
    entity_type text NOT NULL, entity_id uuid NOT NULL, payload_json jsonb NOT NULL DEFAULT '{}', depth integer NOT NULL DEFAULT 0,
    status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','processing','completed','failed')),
    error text, created_at timestamptz NOT NULL DEFAULT now(), processed_at timestamptz, CHECK(depth<=5)
);
CREATE INDEX automation_events_pending_idx ON automation_events(status,created_at);
CREATE TABLE automation_runs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), rule_id uuid NOT NULL REFERENCES automation_rules(id),
    event_id uuid NOT NULL REFERENCES automation_events(id), status text NOT NULL, result_json jsonb, error text,
    created_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz, UNIQUE(rule_id,event_id)
);
CREATE FUNCTION enqueue_automation_event() RETURNS trigger AS $$
DECLARE event_name text; task_ref uuid;
BEGIN
    IF NEW.actor_source='automation_engine' THEN RETURN NEW; END IF;
    event_name:=CASE WHEN NEW.entity_type='project' AND NEW.action='create' THEN 'project.created'
                     WHEN NEW.entity_type='task' AND NEW.action='create' THEN 'task.created'
                     WHEN NEW.entity_type='task' AND NEW.action='status_change' THEN 'task.status_changed'
                     ELSE NULL END;
    IF NEW.entity_type='checklist_item' AND NEW.action='update' AND NEW.after_json->>'is_done'='true' THEN
        task_ref:=(NEW.after_json->>'task_id')::uuid;
        IF NOT EXISTS(SELECT 1 FROM checklist_items WHERE tenant_id=NEW.tenant_id AND task_id=task_ref AND NOT is_done) THEN
            event_name:='task.checklist_completed';
            INSERT INTO automation_events(tenant_id,event,entity_type,entity_id,payload_json)
            VALUES(NEW.tenant_id,event_name,'task',task_ref,NEW.after_json);
            RETURN NEW;
        END IF;
    END IF;
    IF event_name IS NOT NULL THEN INSERT INTO automation_events(tenant_id,event,entity_type,entity_id,payload_json) VALUES(NEW.tenant_id,event_name,NEW.entity_type,NEW.entity_id,COALESCE(NEW.after_json,'{}')); END IF;
    RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER audit_events_automation_outbox AFTER INSERT ON audit_events FOR EACH ROW EXECUTE FUNCTION enqueue_automation_event();

CREATE TABLE api_usage_events (
    id bigserial PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES tenants(id), api_client_id uuid NOT NULL REFERENCES api_clients(id),
    request_id uuid, method text NOT NULL, path text NOT NULL, status_code integer NOT NULL, duration_ms integer NOT NULL,
    occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX api_usage_events_client_time_idx ON api_usage_events(api_client_id,occurred_at DESC);

CREATE TABLE ai_query_history (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), user_id uuid NOT NULL REFERENCES users(id),
    question text NOT NULL, answer text NOT NULL, evidence_json jsonb NOT NULL DEFAULT '[]', created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE template_marketplace (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), template_id uuid NOT NULL REFERENCES project_templates(id),
    division_id uuid REFERENCES divisions(id), published_by uuid NOT NULL REFERENCES users(id), name text NOT NULL,
    description text, version integer NOT NULL DEFAULT 1, export_json jsonb NOT NULL, is_published boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX template_marketplace_tenant_division_idx ON template_marketplace(tenant_id,division_id,is_published);

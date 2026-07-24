CREATE FUNCTION enqueue_npms_webhook() RETURNS trigger AS $$
DECLARE event_name text;
BEGIN
    event_name := CASE
        WHEN NEW.entity_type='project' AND NEW.action='create' THEN 'project.created'
        WHEN NEW.entity_type='project' AND NEW.action='status_change' THEN 'project.status_changed'
        WHEN NEW.entity_type='task' AND NEW.action='status_change' AND NEW.after_json->>'board_column'='done' THEN 'task.completed'
        WHEN NEW.entity_type='milestone' AND NEW.action='status_change' AND NEW.after_json->>'status'='done' THEN 'milestone.completed'
        WHEN NEW.entity_type='report_export' AND NEW.action='create' THEN 'report.ready'
        ELSE NULL
    END;
    IF event_name IS NOT NULL THEN
        INSERT INTO webhook_deliveries(tenant_id,subscription_id,event,payload_json,next_attempt_at)
        SELECT NEW.tenant_id,s.id,event_name,jsonb_build_object(
            'event',event_name,'event_id',NEW.id,'tenant_id',NEW.tenant_id,
            'entity_type',NEW.entity_type,'entity_id',NEW.entity_id,
            'occurred_at',NEW.created_at,'data',COALESCE(NEW.after_json,'{}'::jsonb)
        ),now()
        FROM webhook_subscriptions s
        WHERE s.tenant_id=NEW.tenant_id AND s.event=event_name AND s.is_active;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER audit_events_webhook_outbox AFTER INSERT ON audit_events
FOR EACH ROW EXECUTE FUNCTION enqueue_npms_webhook();

DROP TRIGGER IF EXISTS audit_events_webhook_outbox ON audit_events;
DROP FUNCTION IF EXISTS enqueue_npms_webhook();

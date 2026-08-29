DROP INDEX IF EXISTS notification_delivery_queue_due_idx;
ALTER TABLE notification_delivery_settings DROP COLUMN IF EXISTS queue_last_run_at;
ALTER TABLE notification_delivery_settings DROP COLUMN IF EXISTS queue_interval_minutes;

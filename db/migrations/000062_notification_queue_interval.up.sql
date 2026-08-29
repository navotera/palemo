ALTER TABLE notification_delivery_settings
    ADD COLUMN queue_interval_minutes integer NOT NULL DEFAULT 15
        CHECK (queue_interval_minutes IN (5, 10, 15, 30, 60));

ALTER TABLE notification_delivery_settings
    ADD COLUMN queue_last_run_at timestamptz NULL;

CREATE INDEX notification_delivery_queue_due_idx
    ON notification_delivery_settings (queue_last_run_at, queue_interval_minutes);

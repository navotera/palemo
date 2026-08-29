ALTER TABLE notifications
    ADD COLUMN IF NOT EXISTS dedupe_key text,
    ADD COLUMN IF NOT EXISTS available_at timestamptz NOT NULL DEFAULT now(),
    ADD COLUMN IF NOT EXISTS sent_at timestamptz,
    ADD COLUMN IF NOT EXISTS failed_at timestamptz,
    ADD COLUMN IF NOT EXISTS failure_reason text;

CREATE UNIQUE INDEX IF NOT EXISTS notifications_dedupe_idx
    ON notifications (tenant_id, recipient_id, channel, dedupe_key)
    WHERE dedupe_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS notifications_email_queue_idx
    ON notifications (status, channel, available_at, created_at)
    WHERE channel = 'email' AND status = 'queued';

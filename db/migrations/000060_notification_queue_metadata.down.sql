DROP INDEX IF EXISTS notifications_email_queue_idx;
DROP INDEX IF EXISTS notifications_dedupe_idx;
ALTER TABLE notifications
    DROP COLUMN IF EXISTS failure_reason,
    DROP COLUMN IF EXISTS failed_at,
    DROP COLUMN IF EXISTS sent_at,
    DROP COLUMN IF EXISTS available_at,
    DROP COLUMN IF EXISTS dedupe_key;

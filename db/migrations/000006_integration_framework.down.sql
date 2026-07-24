ALTER TABLE api_clients DROP COLUMN IF EXISTS rate_limit_per_minute;
ALTER TABLE api_clients DROP COLUMN IF EXISTS last_used_at;
DROP TABLE IF EXISTS github_webhook_events;
DROP TABLE IF EXISTS github_project_links;
DROP TABLE IF EXISTS notifications;
DROP TABLE IF EXISTS webhook_deliveries;
DROP TABLE IF EXISTS webhook_subscriptions;

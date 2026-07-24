DROP TRIGGER IF EXISTS audit_events_no_update_or_delete ON audit_events;
DROP FUNCTION IF EXISTS prevent_audit_event_mutation();
DROP TABLE IF EXISTS audit_events;
DROP TABLE IF EXISTS idempotency_keys;
DROP TABLE IF EXISTS api_clients;
DROP TABLE IF EXISTS checklist_items;
DROP TABLE IF EXISTS tasks;
DROP TABLE IF EXISTS projects;
DROP TABLE IF EXISTS role_mappings;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS teams;
DROP TABLE IF EXISTS divisions;
DROP TABLE IF EXISTS tenants;


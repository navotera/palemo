ALTER TABLE user_idempotency_keys
  DROP CONSTRAINT IF EXISTS user_idempotency_keys_command_path_length,
  DROP COLUMN IF EXISTS command_path;

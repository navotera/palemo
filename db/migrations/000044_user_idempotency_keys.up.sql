ALTER TABLE user_idempotency_keys
  ADD COLUMN command_path text;

UPDATE user_idempotency_keys
SET command_path = 'legacy:' || request_hash
WHERE command_path IS NULL;

ALTER TABLE user_idempotency_keys
  ALTER COLUMN command_path SET NOT NULL,
  ADD CONSTRAINT user_idempotency_keys_command_path_length
    CHECK (char_length(command_path) BETWEEN 1 AND 255);

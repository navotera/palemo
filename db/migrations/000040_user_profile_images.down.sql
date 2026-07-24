ALTER TABLE users DROP CONSTRAINT IF EXISTS users_profile_image_size_check;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_profile_image_content_type_check;
ALTER TABLE users DROP COLUMN IF EXISTS profile_image_size_bytes;
ALTER TABLE users DROP COLUMN IF EXISTS profile_image_content_type;
ALTER TABLE users DROP COLUMN IF EXISTS profile_image;

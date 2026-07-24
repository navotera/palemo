ALTER TABLE users ADD COLUMN profile_image bytea;
ALTER TABLE users ADD COLUMN profile_image_content_type text;
ALTER TABLE users ADD COLUMN profile_image_size_bytes integer;
ALTER TABLE users ADD CONSTRAINT users_profile_image_content_type_check CHECK (profile_image_content_type IS NULL OR profile_image_content_type IN ('image/jpeg','image/png','image/webp'));
ALTER TABLE users ADD CONSTRAINT users_profile_image_size_check CHECK (profile_image_size_bytes IS NULL OR profile_image_size_bytes BETWEEN 1 AND 2097152);

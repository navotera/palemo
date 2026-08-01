ALTER TABLE tenant_settings
ADD COLUMN country_code varchar(2) NOT NULL DEFAULT 'ID'
CHECK (country_code ~ '^[A-Z]{2}$');

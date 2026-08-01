ALTER TABLE tenant_settings
ADD COLUMN date_format varchar(20) NOT NULL DEFAULT 'd F Y'
CHECK (date_format IN ('d F Y','d M Y','Y-m-d','d/m/Y','m/d/Y'));

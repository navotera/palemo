UPDATE tenant_settings SET theme_tone='forest' WHERE theme_tone='custom';
ALTER TABLE tenant_settings DROP COLUMN IF EXISTS custom_theme_angle;
ALTER TABLE tenant_settings DROP COLUMN IF EXISTS custom_theme_secondary;
ALTER TABLE tenant_settings DROP COLUMN IF EXISTS custom_theme_primary;
ALTER TABLE tenant_settings DROP COLUMN IF EXISTS custom_theme_mode;
ALTER TABLE tenant_settings DROP CONSTRAINT IF EXISTS tenant_settings_theme_tone_check;
ALTER TABLE tenant_settings ADD CONSTRAINT tenant_settings_theme_tone_check CHECK (theme_tone IN ('forest','ocean','indigo','terracotta','slate','gradient_aurora','gradient_ocean','gradient_sunset'));
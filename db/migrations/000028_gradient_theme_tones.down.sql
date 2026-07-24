UPDATE tenant_settings SET theme_tone='forest' WHERE theme_tone LIKE 'gradient_%';
ALTER TABLE tenant_settings DROP CONSTRAINT IF EXISTS tenant_settings_theme_tone_check;
ALTER TABLE tenant_settings ADD CONSTRAINT tenant_settings_theme_tone_check CHECK (theme_tone IN ('forest','ocean','indigo','terracotta','slate'));
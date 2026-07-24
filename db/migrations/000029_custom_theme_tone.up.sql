ALTER TABLE tenant_settings DROP CONSTRAINT IF EXISTS tenant_settings_theme_tone_check;
ALTER TABLE tenant_settings ADD CONSTRAINT tenant_settings_theme_tone_check CHECK (theme_tone IN ('forest','ocean','indigo','terracotta','slate','gradient_aurora','gradient_ocean','gradient_sunset','custom'));
ALTER TABLE tenant_settings ADD COLUMN custom_theme_mode text NOT NULL DEFAULT 'solid' CHECK(custom_theme_mode IN ('solid','gradient'));
ALTER TABLE tenant_settings ADD COLUMN custom_theme_primary text NOT NULL DEFAULT '#1b5338' CHECK(custom_theme_primary ~ '^#[0-9A-Fa-f]{6}$');
ALTER TABLE tenant_settings ADD COLUMN custom_theme_secondary text NOT NULL DEFAULT '#4774b8' CHECK(custom_theme_secondary ~ '^#[0-9A-Fa-f]{6}$');
ALTER TABLE tenant_settings ADD COLUMN custom_theme_angle integer NOT NULL DEFAULT 135 CHECK(custom_theme_angle BETWEEN 0 AND 360);
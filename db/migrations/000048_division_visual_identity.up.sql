ALTER TABLE divisions
    ADD COLUMN color text NOT NULL DEFAULT '#3b9a68',
    ADD COLUMN icon text NOT NULL DEFAULT '🏢',
    ADD CONSTRAINT divisions_color_format_check CHECK (color ~ '^#[0-9A-Fa-f]{6}$'),
    ADD CONSTRAINT divisions_icon_length_check CHECK (char_length(icon) BETWEEN 1 AND 16);

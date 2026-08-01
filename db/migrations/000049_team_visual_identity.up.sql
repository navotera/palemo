ALTER TABLE teams
    ADD COLUMN color text NOT NULL DEFAULT '#4774b8',
    ADD COLUMN icon text NOT NULL DEFAULT '👥',
    ADD CONSTRAINT teams_color_format_check CHECK (color ~ '^#[0-9A-Fa-f]{6}$'),
    ADD CONSTRAINT teams_icon_length_check CHECK (char_length(icon) BETWEEN 1 AND 16);

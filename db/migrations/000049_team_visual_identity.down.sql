ALTER TABLE teams
    DROP CONSTRAINT IF EXISTS teams_icon_length_check,
    DROP CONSTRAINT IF EXISTS teams_color_format_check,
    DROP COLUMN IF EXISTS icon,
    DROP COLUMN IF EXISTS color;

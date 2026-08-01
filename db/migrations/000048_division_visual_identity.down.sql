ALTER TABLE divisions
    DROP CONSTRAINT IF EXISTS divisions_icon_length_check,
    DROP CONSTRAINT IF EXISTS divisions_color_format_check,
    DROP COLUMN IF EXISTS icon,
    DROP COLUMN IF EXISTS color;

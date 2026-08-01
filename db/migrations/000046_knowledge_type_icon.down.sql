ALTER TABLE knowledge_types
    DROP CONSTRAINT IF EXISTS knowledge_types_icon_length_check;

ALTER TABLE knowledge_types
    DROP COLUMN IF EXISTS icon;

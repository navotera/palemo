ALTER TABLE knowledge_types
    ADD COLUMN icon text;

ALTER TABLE knowledge_types
    ADD CONSTRAINT knowledge_types_icon_length_check
    CHECK (icon IS NULL OR char_length(icon) BETWEEN 1 AND 16);

UPDATE knowledge_types
SET icon = CASE slug
    WHEN 'wiki' THEN '📖'
    WHEN 'meetings' THEN '🗓️'
    WHEN 'decisions' THEN '⚖️'
    WHEN 'lessons' THEN '💡'
    WHEN 'project_preliminary_notes' THEN '📝'
    ELSE '📚'
END
WHERE icon IS NULL;

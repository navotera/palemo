ALTER TABLE wiki_pages ADD COLUMN accessible_division_ids uuid[] NOT NULL DEFAULT '{}';
ALTER TABLE meeting_notes ADD COLUMN accessible_division_ids uuid[] NOT NULL DEFAULT '{}';
ALTER TABLE decision_logs ADD COLUMN accessible_division_ids uuid[] NOT NULL DEFAULT '{}';
ALTER TABLE lessons_learned ADD COLUMN accessible_division_ids uuid[] NOT NULL DEFAULT '{}';

CREATE INDEX wiki_pages_division_access_idx ON wiki_pages USING gin(accessible_division_ids);
CREATE INDEX meeting_notes_division_access_idx ON meeting_notes USING gin(accessible_division_ids);
CREATE INDEX decision_logs_division_access_idx ON decision_logs USING gin(accessible_division_ids);
CREATE INDEX lessons_learned_division_access_idx ON lessons_learned USING gin(accessible_division_ids);

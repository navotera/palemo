ALTER TABLE wiki_pages
    ADD COLUMN accessible_editor_user_ids uuid[] NOT NULL DEFAULT '{}';
ALTER TABLE meeting_notes
    ADD COLUMN accessible_editor_user_ids uuid[] NOT NULL DEFAULT '{}';
ALTER TABLE decision_logs
    ADD COLUMN accessible_editor_user_ids uuid[] NOT NULL DEFAULT '{}';
ALTER TABLE lessons_learned
    ADD COLUMN accessible_editor_user_ids uuid[] NOT NULL DEFAULT '{}';

CREATE INDEX wiki_pages_editor_access_idx ON wiki_pages USING gin(accessible_editor_user_ids);
CREATE INDEX meeting_notes_editor_access_idx ON meeting_notes USING gin(accessible_editor_user_ids);
CREATE INDEX decision_logs_editor_access_idx ON decision_logs USING gin(accessible_editor_user_ids);
CREATE INDEX lessons_learned_editor_access_idx ON lessons_learned USING gin(accessible_editor_user_ids);

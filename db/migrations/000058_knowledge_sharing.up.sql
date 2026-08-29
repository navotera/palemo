ALTER TABLE wiki_pages
    ADD COLUMN accessible_team_ids uuid[] NOT NULL DEFAULT '{}',
    ADD COLUMN accessible_user_ids uuid[] NOT NULL DEFAULT '{}';
ALTER TABLE meeting_notes
    ADD COLUMN accessible_team_ids uuid[] NOT NULL DEFAULT '{}',
    ADD COLUMN accessible_user_ids uuid[] NOT NULL DEFAULT '{}';
ALTER TABLE decision_logs
    ADD COLUMN accessible_team_ids uuid[] NOT NULL DEFAULT '{}',
    ADD COLUMN accessible_user_ids uuid[] NOT NULL DEFAULT '{}';
ALTER TABLE lessons_learned
    ADD COLUMN accessible_team_ids uuid[] NOT NULL DEFAULT '{}',
    ADD COLUMN accessible_user_ids uuid[] NOT NULL DEFAULT '{}';

CREATE INDEX wiki_pages_team_access_idx ON wiki_pages USING gin(accessible_team_ids);
CREATE INDEX wiki_pages_user_access_idx ON wiki_pages USING gin(accessible_user_ids);
CREATE INDEX meeting_notes_team_access_idx ON meeting_notes USING gin(accessible_team_ids);
CREATE INDEX meeting_notes_user_access_idx ON meeting_notes USING gin(accessible_user_ids);
CREATE INDEX decision_logs_team_access_idx ON decision_logs USING gin(accessible_team_ids);
CREATE INDEX decision_logs_user_access_idx ON decision_logs USING gin(accessible_user_ids);
CREATE INDEX lessons_learned_team_access_idx ON lessons_learned USING gin(accessible_team_ids);
CREATE INDEX lessons_learned_user_access_idx ON lessons_learned USING gin(accessible_user_ids);

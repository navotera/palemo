ALTER TABLE user_workspace_states ADD COLUMN preferred_editor_mode text NOT NULL DEFAULT 'visual' CHECK (preferred_editor_mode IN ('visual','markdown'));

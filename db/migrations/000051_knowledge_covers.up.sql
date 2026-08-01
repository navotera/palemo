ALTER TABLE wiki_pages
    ADD COLUMN cover_source text CHECK (cover_source IN ('upload', 'url')),
    ADD COLUMN cover_url text,
    ADD CONSTRAINT wiki_pages_cover_pair_check CHECK ((cover_source IS NULL) = (cover_url IS NULL));

ALTER TABLE meeting_notes
    ADD COLUMN cover_source text CHECK (cover_source IN ('upload', 'url')),
    ADD COLUMN cover_url text,
    ADD CONSTRAINT meeting_notes_cover_pair_check CHECK ((cover_source IS NULL) = (cover_url IS NULL));

ALTER TABLE decision_logs
    ADD COLUMN cover_source text CHECK (cover_source IN ('upload', 'url')),
    ADD COLUMN cover_url text,
    ADD CONSTRAINT decision_logs_cover_pair_check CHECK ((cover_source IS NULL) = (cover_url IS NULL));

ALTER TABLE lessons_learned
    ADD COLUMN cover_source text CHECK (cover_source IN ('upload', 'url')),
    ADD COLUMN cover_url text,
    ADD CONSTRAINT lessons_learned_cover_pair_check CHECK ((cover_source IS NULL) = (cover_url IS NULL));

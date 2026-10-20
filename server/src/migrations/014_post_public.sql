-- Posts publics (opt-in par l'auteur) : seuls les posts is_public = 1 ont une page indexable (/p/:id)
ALTER TABLE posts ADD COLUMN is_public TINYINT(1) NOT NULL DEFAULT 0 AFTER edited_at;
ALTER TABLE posts ADD KEY idx_posts_public (is_public, created_at)

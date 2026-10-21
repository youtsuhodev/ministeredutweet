-- Réponses aux commentaires : un commentaire peut répondre à un commentaire de premier niveau (un seul niveau d'imbrication).
-- Pas de clé étrangère (convention du projet) : les réponses sont supprimées avec leur commentaire par deleteComment(), purgePost() et deleteAccount().
ALTER TABLE comments ADD COLUMN parent_id BIGINT NULL AFTER post_id;
ALTER TABLE comments ADD KEY idx_comments_parent (parent_id)

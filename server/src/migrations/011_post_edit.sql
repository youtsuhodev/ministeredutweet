-- Modification d'un post : date de la dernière modification (NULL = jamais modifié)
ALTER TABLE posts ADD COLUMN edited_at TIMESTAMP NULL DEFAULT NULL AFTER created_at

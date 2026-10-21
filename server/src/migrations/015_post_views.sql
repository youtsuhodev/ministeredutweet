-- Pas de clé étrangère (convention du projet, et elle échouait sur les bases dont posts.id n'a pas exactement le même type) :
-- le nettoyage des vues d'un post supprimé est fait dans purgePost() et deleteAccount().
-- Vues uniques : une ligne par (post, visiteur), le visiteur est une empreinte irréversible (HMAC) de son adresse IP, jamais l'IP elle-même
CREATE TABLE IF NOT EXISTS post_views (
  post_id BIGINT NOT NULL,
  viewer_hash CHAR(64) NOT NULL,
  first_seen TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (post_id, viewer_hash),
  KEY idx_post_views_seen (post_id, first_seen)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
ALTER TABLE posts ADD COLUMN views_count INT UNSIGNED NOT NULL DEFAULT 0 AFTER is_public

-- Marque-pages privés : un utilisateur garde une référence sur un post d'origine (jamais un repost),
-- visible par lui seul (pas de compte public, pas de notification).
-- Pas de clé étrangère (convention du projet) : le nettoyage est fait dans purgePost() et deleteAccount().
CREATE TABLE IF NOT EXISTS bookmarks (
  uid VARCHAR(128) NOT NULL,
  post_id BIGINT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (uid, post_id),
  KEY idx_bookmarks_user (uid, created_at),
  KEY idx_bookmarks_post (post_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4

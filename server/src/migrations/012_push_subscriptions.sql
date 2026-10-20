-- Abonnements Web Push (un par appareil / navigateur). Pas de clé étrangère : le nettoyage à la suppression
-- d'un compte est fait explicitement dans deleteAccount(). endpoint_hash (SHA-256) sert de clé unique.
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  uid VARCHAR(128) NOT NULL,
  endpoint_hash CHAR(64) NOT NULL,
  endpoint TEXT NOT NULL,
  p256dh VARCHAR(255) NOT NULL,
  auth VARCHAR(255) NOT NULL,
  user_agent VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_push_endpoint (endpoint_hash),
  KEY idx_push_uid (uid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4

-- Salon public en temps réel : un seul grand fil de discussion ouvert à tous les comptes.
-- Les messages sont conservés CHAT_RETENTION_DAYS jours (30 par défaut) puis supprimés (voir services/chat.ts).
-- Pas de clé étrangère (comme blocks/reports) : le nettoyage à la suppression d'un compte est fait par deleteAccount().
CREATE TABLE IF NOT EXISTS chat_messages (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  uid VARCHAR(128) NOT NULL,
  body VARCHAR(500) NOT NULL,
  created_at BIGINT NOT NULL,
  deleted_at BIGINT NULL,
  deleted_by VARCHAR(128) NULL,
  KEY idx_chat_messages_created (created_at),
  KEY idx_chat_messages_uid (uid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
-- La colonne uid prend la collation de users.uid (sinon « Illegal mix of collations » dans les jointures)
SET @coll = (SELECT COLLATION_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'uid');
SET @sql = (SELECT IF(COUNT(*) > 0 AND @coll LIKE 'utf8mb4%', CONCAT('ALTER TABLE `chat_messages` CONVERT TO CHARACTER SET utf8mb4 COLLATE ', @coll), 'SELECT 1') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'chat_messages' AND COLLATION_NAME IS NOT NULL AND COLLATION_NAME <> @coll);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt

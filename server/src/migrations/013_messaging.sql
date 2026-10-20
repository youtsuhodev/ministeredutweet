-- Messagerie privée : conversations (1-à-1 « direct » ou « group »), membres, messages, médias privés.
-- Pas de clés étrangères (comme blocks/reports) : le nettoyage à la suppression d'un compte est fait par purgeUserMessaging().
-- Le contenu des messages est chiffré au repos côté application (voir services/messageCrypto.ts).
ALTER TABLE users ADD COLUMN dm_policy VARCHAR(12) NOT NULL DEFAULT 'mutual';
CREATE TABLE IF NOT EXISTS conversations (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  type VARCHAR(8) NOT NULL,
  title VARCHAR(80) NULL,
  created_by VARCHAR(128) NOT NULL,
  direct_key VARCHAR(300) NULL,
  created_at BIGINT NOT NULL,
  last_message_id BIGINT NULL,
  last_message_at BIGINT NOT NULL,
  UNIQUE KEY uq_conversations_direct (direct_key),
  KEY idx_conversations_last (last_message_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS conversation_members (
  conversation_id BIGINT NOT NULL,
  uid VARCHAR(128) NOT NULL,
  role VARCHAR(8) NOT NULL DEFAULT 'member',
  joined_at BIGINT NOT NULL,
  last_read_message_id BIGINT NOT NULL DEFAULT 0,
  cleared_before_id BIGINT NOT NULL DEFAULT 0,
  muted TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (conversation_id, uid),
  KEY idx_conversation_members_uid (uid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS messages (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  conversation_id BIGINT NOT NULL,
  sender_uid VARCHAR(128) NOT NULL,
  kind VARCHAR(8) NOT NULL DEFAULT 'text',
  body TEXT NULL,
  media VARCHAR(128) NULL,
  media_type VARCHAR(8) NULL,
  media_duration SMALLINT UNSIGNED NULL,
  created_at BIGINT NOT NULL,
  deleted_at BIGINT NULL,
  KEY idx_messages_conversation (conversation_id, id),
  KEY idx_messages_sender (sender_uid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS message_media (
  filename VARCHAR(128) NOT NULL PRIMARY KEY,
  uploader_uid VARCHAR(128) NOT NULL,
  media_type VARCHAR(8) NOT NULL,
  message_id BIGINT NULL,
  created_at BIGINT NOT NULL,
  KEY idx_message_media_message (message_id),
  KEY idx_message_media_uploader (uploader_uid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
-- Les colonnes uid prennent la collation de users.uid (sinon « Illegal mix of collations » dans les jointures)
SET @coll = (SELECT COLLATION_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'uid');
SET @sql = (SELECT IF(COUNT(*) > 0 AND @coll LIKE 'utf8mb4%', CONCAT('ALTER TABLE `conversations` CONVERT TO CHARACTER SET utf8mb4 COLLATE ', @coll), 'SELECT 1') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'conversations' AND COLLATION_NAME IS NOT NULL AND COLLATION_NAME <> @coll);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
SET @sql = (SELECT IF(COUNT(*) > 0 AND @coll LIKE 'utf8mb4%', CONCAT('ALTER TABLE `conversation_members` CONVERT TO CHARACTER SET utf8mb4 COLLATE ', @coll), 'SELECT 1') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'conversation_members' AND COLLATION_NAME IS NOT NULL AND COLLATION_NAME <> @coll);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
SET @sql = (SELECT IF(COUNT(*) > 0 AND @coll LIKE 'utf8mb4%', CONCAT('ALTER TABLE `messages` CONVERT TO CHARACTER SET utf8mb4 COLLATE ', @coll), 'SELECT 1') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'messages' AND COLLATION_NAME IS NOT NULL AND COLLATION_NAME <> @coll);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
SET @sql = (SELECT IF(COUNT(*) > 0 AND @coll LIKE 'utf8mb4%', CONCAT('ALTER TABLE `message_media` CONVERT TO CHARACTER SET utf8mb4 COLLATE ', @coll), 'SELECT 1') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'message_media' AND COLLATION_NAME IS NOT NULL AND COLLATION_NAME <> @coll);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt

-- Corrige « Illegal mix of collations » dans le salon public (listChat) : chat_messages et blocks reprennent la collation de users.uid.
-- 020_public_chat.sql fait déjà cet alignement, mais une base où 020 a été appliquée AVANT l'ajout de cette étape ne la rejoue jamais
-- (les migrations sont suivies par nom de fichier). Cette migration est idempotente : sans écart de collation, elle ne fait rien.
SET @coll = (SELECT COLLATION_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'uid');
SET @sql = (SELECT IF(COUNT(*) > 0 AND @coll LIKE 'utf8mb4%', CONCAT('ALTER TABLE `chat_messages` CONVERT TO CHARACTER SET utf8mb4 COLLATE ', @coll), 'SELECT 1') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'chat_messages' AND COLLATION_NAME IS NOT NULL AND COLLATION_NAME <> @coll);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
SET @sql = (SELECT IF(COUNT(*) > 0 AND @coll LIKE 'utf8mb4%', CONCAT('ALTER TABLE `blocks` CONVERT TO CHARACTER SET utf8mb4 COLLATE ', @coll), 'SELECT 1') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'blocks' AND COLLATION_NAME IS NOT NULL AND COLLATION_NAME <> @coll);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt

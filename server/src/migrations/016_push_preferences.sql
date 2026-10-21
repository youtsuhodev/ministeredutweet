-- Préférences de notifications push (par compte, activées par défaut) :
--   push_new_posts : une notification à chaque nouveau post publié sur la plateforme
--   push_activity  : likes, réponses, mentions, reposts et abonnements
ALTER TABLE users ADD COLUMN push_new_posts TINYINT(1) NOT NULL DEFAULT 1;
ALTER TABLE users ADD COLUMN push_activity TINYINT(1) NOT NULL DEFAULT 1;
-- push_subscriptions.uid prend la collation de users.uid (jointure de la diffusion des nouveaux posts)
SET @coll = (SELECT COLLATION_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'uid');
SET @sql = (SELECT IF(COUNT(*) > 0 AND @coll LIKE 'utf8mb4%', CONCAT('ALTER TABLE `push_subscriptions` CONVERT TO CHARACTER SET utf8mb4 COLLATE ', @coll), 'SELECT 1') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'push_subscriptions' AND COLLATION_NAME IS NOT NULL AND COLLATION_NAME <> @coll);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt

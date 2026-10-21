-- Corrige users.status et users.role sur les bases issues de l'ancienne appli de messagerie.
-- La migration 008 faisait « ADD COLUMN status VARCHAR(16) », si la colonne existait déjà (ancien ENUM de présence),
-- l'erreur « colonne en double » était ignorée et la colonne gardait son ancien type : « suspended » et « banned »
-- étaient alors refusés (Data truncated for column 'status'). On force le bon type, puis on normalise les valeurs.
ALTER TABLE users MODIFY COLUMN status VARCHAR(16) NULL DEFAULT 'active';
UPDATE users SET status = 'active' WHERE status IS NULL OR status NOT IN ('active', 'suspended', 'banned');
ALTER TABLE users MODIFY COLUMN status VARCHAR(16) NOT NULL DEFAULT 'active';
ALTER TABLE users MODIFY COLUMN role VARCHAR(16) NULL DEFAULT 'user';
UPDATE users SET role = 'user' WHERE role IS NULL OR role NOT IN ('user', 'moderator', 'admin');
ALTER TABLE users MODIFY COLUMN role VARCHAR(16) NOT NULL DEFAULT 'user'

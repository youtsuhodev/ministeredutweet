-- Comptes pseudo + mot de passe uniquement : suppression des adresses e-mail et clés de récupération.
-- /!\ Irréversible : les adresses e-mail sont effacées de la base. Faire une sauvegarde AVANT le premier démarrage,
-- puis purger cette sauvegarde (elle contient encore les adresses).

-- Clés de récupération du compte (seule l'empreinte est stockée) : permettent de réinitialiser le mot de passe.
CREATE TABLE IF NOT EXISTS account_recovery_keys (
  uid VARCHAR(128) NOT NULL,
  key_hash CHAR(64) NOT NULL,
  used_at BIGINT NULL,
  PRIMARY KEY (uid, key_hash)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- recovery_ack = 0 : le compte n'a pas encore enregistré ses clés (pop-up à afficher).
-- legacy_notice = 1 : ancien compte (avait une adresse e-mail), la pop-up explique le changement.
ALTER TABLE users ADD COLUMN recovery_ack TINYINT(1) NOT NULL DEFAULT 0, ADD COLUMN legacy_notice TINYINT(1) NOT NULL DEFAULT 0;

UPDATE users SET legacy_notice = 1;

-- Les jetons (réinitialisation, vérification, changement d'e-mail) contenaient des adresses : table supprimée.
DROP TABLE IF EXISTS auth_tokens;

-- Suppression définitive des adresses e-mail.
ALTER TABLE users DROP INDEX uk_users_email, DROP COLUMN email, DROP COLUMN emailVerified;

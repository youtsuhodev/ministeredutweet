-- Assistant d'onboarding : l'assistant s'affiche tant que le compte n'a pas été présenté (0).
-- Les comptes existants à l'installation sont marqués comme présentés : ils ne verront pas le tutoriel.
ALTER TABLE users ADD COLUMN onboarding_done TINYINT(1) NOT NULL DEFAULT 0;
UPDATE users SET onboarding_done = 1;

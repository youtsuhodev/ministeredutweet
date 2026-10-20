-- Messages vocaux : un post peut porter un enregistrement audio (/uploads/...) et sa durée en secondes
ALTER TABLE posts ADD COLUMN audio VARCHAR(500) NULL AFTER video;
ALTER TABLE posts ADD COLUMN audio_duration SMALLINT UNSIGNED NULL AFTER audio

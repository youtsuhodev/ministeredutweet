CREATE TABLE IF NOT EXISTS mobilisations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  slug VARCHAR(120) NOT NULL UNIQUE,
  title VARCHAR(200) NOT NULL,
  description TEXT NOT NULL,
  practical_info TEXT NULL,
  event_date DATETIME NOT NULL,
  location VARCHAR(300) NOT NULL,
  image VARCHAR(500) NULL,
  status ENUM('upcoming','ongoing','past','cancelled') NOT NULL DEFAULT 'upcoming',
  created_by VARCHAR(36) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_mob_date (event_date),
  INDEX idx_mob_status (status),
  INDEX idx_mob_slug (slug),
  INDEX idx_mob_status_date (status, event_date DESC)
);

CREATE TABLE IF NOT EXISTS mobilisation_participants (
  mobilisation_id INT NOT NULL,
  uid VARCHAR(36) NOT NULL,
  joined_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (mobilisation_id, uid),
  INDEX idx_mp_uid (uid),
  FOREIGN KEY (mobilisation_id) REFERENCES mobilisations(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS mobilisation_media (
  id INT AUTO_INCREMENT PRIMARY KEY,
  mobilisation_id INT NOT NULL,
  uid VARCHAR(36) NOT NULL,
  url VARCHAR(500) NOT NULL,
  type ENUM('image','video') NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_mm_mob (mobilisation_id),
  FOREIGN KEY (mobilisation_id) REFERENCES mobilisations(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS mobilisation_comments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  mobilisation_id INT NOT NULL,
  uid VARCHAR(36) NOT NULL,
  body VARCHAR(2000) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at DATETIME NULL,
  INDEX idx_mc_mob (mobilisation_id),
  INDEX idx_mc_uid (uid),
  FOREIGN KEY (mobilisation_id) REFERENCES mobilisations(id) ON DELETE CASCADE
);

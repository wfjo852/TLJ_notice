CREATE TABLE IF NOT EXISTS members (
  id CHAR(4) PRIMARY KEY,
  name VARCHAR(30) NOT NULL,
  permissions JSON NOT NULL,
  session_token CHAR(36) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS posts (
  id CHAR(36) PRIMARY KEY,
  board ENUM('cake','notice','request') NOT NULL,
  title VARCHAR(150) NOT NULL,
  body MEDIUMTEXT NOT NULL,
  author VARCHAR(30) NOT NULL,
  member CHAR(4) NULL,
  owner CHAR(36) NULL,
  created DATETIME NOT NULL,
  updated DATETIME NOT NULL,
  INDEX idx_posts_board (board),
  INDEX idx_posts_owner (owner)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS drafts (
  id VARCHAR(100) PRIMARY KEY,
  board ENUM('cake','notice','request') NOT NULL,
  title VARCHAR(150) NOT NULL DEFAULT '',
  body MEDIUMTEXT NOT NULL,
  guest VARCHAR(30) NOT NULL DEFAULT '',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS media (
  id CHAR(36) PRIMARY KEY,
  post_id CHAR(36) NULL,
  draft_id VARCHAR(100) NULL,
  kind ENUM('image','video') NOT NULL,
  name VARCHAR(255) NOT NULL,
  mime VARCHAR(100) NOT NULL,
  path VARCHAR(255) NOT NULL,
  size INT NOT NULL,
  position INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_media_post (post_id),
  INDEX idx_media_draft (draft_id),
  CONSTRAINT fk_media_post FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
  CONSTRAINT fk_media_draft FOREIGN KEY (draft_id) REFERENCES drafts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS claims (
  id CHAR(36) PRIMARY KEY,
  phone VARCHAR(11) NOT NULL,
  purchase_date DATE NOT NULL,
  item VARCHAR(100) NOT NULL,
  content TEXT NOT NULL,
  resolved TINYINT(1) NOT NULL DEFAULT 0,
  author VARCHAR(30) NOT NULL,
  member CHAR(4) NULL,
  created DATETIME NOT NULL,
  updated DATETIME NOT NULL,
  INDEX idx_claims_phone (phone, created)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS claim_comments (
  id CHAR(36) PRIMARY KEY,
  claim_id CHAR(36) NOT NULL,
  body TEXT NOT NULL,
  author VARCHAR(30) NOT NULL,
  member CHAR(4) NULL,
  created DATETIME NOT NULL,
  INDEX idx_claim_comments_claim (claim_id, created),
  CONSTRAINT fk_claim_comments_claim FOREIGN KEY (claim_id) REFERENCES claims(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Real user identities for password + OIDC authentication.
-- Prior to this migration there was no users table; user_project_roles.user_id
-- referenced free-text ids. Production identity now lives here.

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'viewer',
  provider      TEXT NOT NULL DEFAULT 'local',   -- 'local' | 'oidc'
  password_hash TEXT,                            -- bcrypt hash; null for OIDC-only users
  oidc_subject  TEXT UNIQUE,                      -- IdP 'sub' claim; null for local users
  disabled      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(LOWER(email));
CREATE INDEX IF NOT EXISTS idx_users_oidc ON users(oidc_subject);

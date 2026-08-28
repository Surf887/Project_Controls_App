ALTER TABLE users
  ADD COLUMN IF NOT EXISTS scim_external_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_scim_external_id
  ON users(scim_external_id)
  WHERE scim_external_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS auth_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auth_sessions_user
  ON auth_sessions(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_auth_sessions_active
  ON auth_sessions(expires_at)
  WHERE revoked_at IS NULL;

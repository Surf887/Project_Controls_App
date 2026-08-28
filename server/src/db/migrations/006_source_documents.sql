CREATE TABLE IF NOT EXISTS source_documents (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  provider TEXT NOT NULL,
  status TEXT NOT NULL,
  encrypted_content BYTEA NOT NULL,
  extraction_encrypted BYTEA,
  draft_drivers JSONB NOT NULL DEFAULT '[]',
  uploaded_by TEXT NOT NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  error TEXT
);

CREATE INDEX IF NOT EXISTS idx_source_documents_project
  ON source_documents(project_id, uploaded_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_source_documents_project_hash
  ON source_documents(project_id, sha256);

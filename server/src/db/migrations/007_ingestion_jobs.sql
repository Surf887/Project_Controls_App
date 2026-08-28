CREATE TABLE IF NOT EXISTS ingestion_jobs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  job_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  request JSONB NOT NULL,
  result JSONB,
  idempotency_key TEXT,
  created_by_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_by_name TEXT NOT NULL,
  created_by_role TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  lease_owner TEXT,
  lease_until TIMESTAMPTZ,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ingestion_jobs_idempotency
  ON ingestion_jobs(project_id, job_type, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ingestion_jobs_claim
  ON ingestion_jobs(status, available_at, created_at);

CREATE INDEX IF NOT EXISTS idx_ingestion_jobs_project
  ON ingestion_jobs(project_id, created_at DESC);

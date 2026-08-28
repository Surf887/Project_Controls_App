import { randomUUID } from 'node:crypto'
import type { IngestionJob, IngestionJobType } from '@pc/data/ingestionJobs.js'
import { isPostgresEnabled, query } from '../db/postgres.js'

interface JobRow {
  id: string
  project_id: string
  job_type: IngestionJobType
  status: IngestionJob['status']
  request: Record<string, unknown>
  result: Record<string, unknown> | null
  idempotency_key: string | null
  created_by_id: string
  created_by_name: string
  created_by_role: string
  attempts: number
  max_attempts: number
  available_at: Date | string
  lease_owner: string | null
  lease_until: Date | string | null
  error: string | null
  created_at: Date | string
  started_at: Date | string | null
  completed_at: Date | string | null
  updated_at: Date | string
}

function iso(value: Date | string | null): string | undefined {
  if (value == null) return undefined
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

function fromRow(row: JobRow): IngestionJob {
  return {
    id: row.id,
    projectId: row.project_id,
    jobType: row.job_type,
    status: row.status,
    request: row.request,
    result: row.result ?? undefined,
    idempotencyKey: row.idempotency_key ?? undefined,
    createdById: row.created_by_id,
    createdByName: row.created_by_name,
    createdByRole: row.created_by_role,
    attempts: row.attempts,
    maxAttempts: row.max_attempts,
    availableAt: iso(row.available_at)!,
    leaseOwner: row.lease_owner ?? undefined,
    leaseUntil: iso(row.lease_until),
    error: row.error ?? undefined,
    createdAt: iso(row.created_at)!,
    startedAt: iso(row.started_at),
    completedAt: iso(row.completed_at),
    updatedAt: iso(row.updated_at)!,
  }
}

const columns = `
  id, project_id, job_type, status, request, result, idempotency_key,
  created_by_id, created_by_name, created_by_role, attempts, max_attempts,
  available_at, lease_owner, lease_until, error, created_at, started_at,
  completed_at, updated_at
`
const jobColumns = `
  job.id, job.project_id, job.job_type, job.status, job.request, job.result,
  job.idempotency_key, job.created_by_id, job.created_by_name, job.created_by_role,
  job.attempts, job.max_attempts, job.available_at, job.lease_owner, job.lease_until,
  job.error, job.created_at, job.started_at, job.completed_at, job.updated_at
`

const memoryJobs = new Map<string, IngestionJob>()

export async function enqueueIngestionJob(input: {
  projectId: string
  jobType: IngestionJobType
  request: Record<string, unknown>
  idempotencyKey?: string
  createdById: string
  createdByName: string
  createdByRole: string
  maxAttempts?: number
}): Promise<IngestionJob> {
  const id = `JOB-${randomUUID()}`
  const now = new Date().toISOString()
  if (!isPostgresEnabled()) {
    const existing = input.idempotencyKey
      ? [...memoryJobs.values()].find(
          (job) =>
            job.projectId === input.projectId &&
            job.jobType === input.jobType &&
            job.idempotencyKey === input.idempotencyKey,
        )
      : undefined
    if (existing) return existing
    const job: IngestionJob = {
      id,
      projectId: input.projectId,
      jobType: input.jobType,
      status: 'queued',
      request: input.request,
      idempotencyKey: input.idempotencyKey,
      createdById: input.createdById,
      createdByName: input.createdByName,
      createdByRole: input.createdByRole,
      attempts: 0,
      maxAttempts: input.maxAttempts ?? 3,
      availableAt: now,
      createdAt: now,
      updatedAt: now,
    }
    memoryJobs.set(job.id, job)
    return job
  }
  const inserted = await query<JobRow>(
    `INSERT INTO ingestion_jobs
      (id, project_id, job_type, request, idempotency_key, created_by_id,
       created_by_name, created_by_role, max_attempts)
     VALUES ($1,$2,$3,$4::jsonb,$5,$6,$7,$8,$9)
     ON CONFLICT (project_id, job_type, idempotency_key)
       WHERE idempotency_key IS NOT NULL
     DO NOTHING
     RETURNING ${columns}`,
    [
      id,
      input.projectId,
      input.jobType,
      JSON.stringify(input.request),
      input.idempotencyKey ?? null,
      input.createdById,
      input.createdByName,
      input.createdByRole,
      input.maxAttempts ?? 3,
    ],
  )
  if (inserted.rows[0]) return fromRow(inserted.rows[0])
  const existing = await query<JobRow>(
    `SELECT ${columns} FROM ingestion_jobs
     WHERE project_id = $1 AND job_type = $2 AND idempotency_key = $3`,
    [input.projectId, input.jobType, input.idempotencyKey],
  )
  if (!existing.rows[0]) throw new Error('Failed to create or resolve idempotent ingestion job')
  return fromRow(existing.rows[0])
}

export async function getIngestionJob(projectId: string, jobId: string): Promise<IngestionJob | null> {
  if (!isPostgresEnabled()) {
    const job = memoryJobs.get(jobId)
    return job?.projectId === projectId ? job : null
  }
  const result = await query<JobRow>(
    `SELECT ${columns} FROM ingestion_jobs WHERE project_id = $1 AND id = $2`,
    [projectId, jobId],
  )
  return result.rows[0] ? fromRow(result.rows[0]) : null
}

export async function listIngestionJobs(projectId: string, limit = 100): Promise<IngestionJob[]> {
  if (!isPostgresEnabled()) {
    return [...memoryJobs.values()]
      .filter((job) => job.projectId === projectId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, limit)
  }
  const result = await query<JobRow>(
    `SELECT ${columns} FROM ingestion_jobs
     WHERE project_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [projectId, Math.min(Math.max(limit, 1), 500)],
  )
  return result.rows.map(fromRow)
}

export async function claimIngestionJob(workerId: string, leaseSeconds = 300): Promise<IngestionJob | null> {
  if (!isPostgresEnabled()) {
    const job = [...memoryJobs.values()].find(
      (entry) =>
        (entry.status === 'queued' && entry.availableAt <= new Date().toISOString()) ||
        (entry.status === 'running' && Boolean(entry.leaseUntil && entry.leaseUntil < new Date().toISOString())),
    )
    if (!job || job.attempts >= job.maxAttempts) return null
    const claimed: IngestionJob = {
      ...job,
      status: 'running',
      attempts: job.attempts + 1,
      leaseOwner: workerId,
      leaseUntil: new Date(Date.now() + leaseSeconds * 1000).toISOString(),
      startedAt: job.startedAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    memoryJobs.set(job.id, claimed)
    return claimed
  }
  const result = await query<JobRow>(
    `WITH candidate AS (
       SELECT id
       FROM ingestion_jobs
       WHERE attempts < max_attempts
         AND (
           (status = 'queued' AND available_at <= NOW())
           OR (status = 'running' AND lease_until < NOW())
         )
       ORDER BY available_at, created_at
       FOR UPDATE SKIP LOCKED
       LIMIT 1
     )
     UPDATE ingestion_jobs job
     SET status = 'running',
         attempts = attempts + 1,
         lease_owner = $1,
         lease_until = NOW() + ($2 * INTERVAL '1 second'),
         started_at = COALESCE(started_at, NOW()),
         updated_at = NOW()
     FROM candidate
     WHERE job.id = candidate.id
     RETURNING ${jobColumns}`,
    [workerId, leaseSeconds],
  )
  return result.rows[0] ? fromRow(result.rows[0]) : null
}

export async function completeIngestionJob(
  jobId: string,
  workerId: string,
  result: Record<string, unknown>,
): Promise<void> {
  if (!isPostgresEnabled()) {
    const job = memoryJobs.get(jobId)
    if (job?.leaseOwner !== workerId) throw new Error('Ingestion job lease mismatch')
    memoryJobs.set(jobId, {
      ...job,
      status: 'completed',
      result,
      leaseOwner: undefined,
      leaseUntil: undefined,
      completedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    return
  }
  const updated = await query(
    `UPDATE ingestion_jobs
     SET status = 'completed', result = $3::jsonb, error = NULL,
         lease_owner = NULL, lease_until = NULL, completed_at = NOW(), updated_at = NOW()
     WHERE id = $1 AND lease_owner = $2`,
    [jobId, workerId, JSON.stringify(result)],
  )
  if (updated.rowCount !== 1) throw new Error('Ingestion job lease mismatch')
}

export async function failIngestionJob(job: IngestionJob, workerId: string, error: string): Promise<void> {
  const terminal = job.attempts >= job.maxAttempts
  const delaySeconds = Math.min(300, 2 ** Math.max(job.attempts, 1))
  if (!isPostgresEnabled()) {
    const current = memoryJobs.get(job.id)
    if (current?.leaseOwner !== workerId) throw new Error('Ingestion job lease mismatch')
    memoryJobs.set(job.id, {
      ...current,
      status: terminal ? 'failed' : 'queued',
      error,
      availableAt: new Date(Date.now() + delaySeconds * 1000).toISOString(),
      leaseOwner: undefined,
      leaseUntil: undefined,
      completedAt: terminal ? new Date().toISOString() : undefined,
      updatedAt: new Date().toISOString(),
    })
    return
  }
  await query(
    `UPDATE ingestion_jobs
     SET status = $3,
         error = $4,
         available_at = NOW() + ($5 * INTERVAL '1 second'),
         lease_owner = NULL,
         lease_until = NULL,
         completed_at = CASE WHEN $3 = 'failed' THEN NOW() ELSE completed_at END,
         updated_at = NOW()
     WHERE id = $1 AND lease_owner = $2`,
    [job.id, workerId, terminal ? 'failed' : 'queued', error.slice(0, 4000), delaySeconds],
  )
}

export function clearMemoryJobsForTest(): void {
  memoryJobs.clear()
}

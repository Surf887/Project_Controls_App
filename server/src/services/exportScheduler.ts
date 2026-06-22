import { randomUUID } from 'node:crypto'
import { isPostgresEnabled, query } from '../db/postgres.js'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const jobsPath = path.resolve(__dirname, '../../data/export_jobs.json')

export interface ExportJob {
  id: string
  projectId: string
  packType: string
  scheduleCron: string
  enabled: boolean
  lastRunAt?: string
  nextRunAt?: string
  createdBy: string
  createdAt: string
}

function readJsonJobs(): ExportJob[] {
  if (!fs.existsSync(jobsPath)) return []
  return JSON.parse(fs.readFileSync(jobsPath, 'utf8')) as ExportJob[]
}

function writeJsonJobs(jobs: ExportJob[]) {
  fs.mkdirSync(path.dirname(jobsPath), { recursive: true })
  fs.writeFileSync(jobsPath, JSON.stringify(jobs, null, 2), 'utf8')
}

function nextMonthlyRun(): string {
  const d = new Date()
  d.setMonth(d.getMonth() + 1)
  d.setDate(1)
  d.setHours(6, 0, 0, 0)
  return d.toISOString()
}

export async function listExportJobs(projectId: string): Promise<ExportJob[]> {
  if (isPostgresEnabled()) {
    const result = await query(
      `SELECT id, project_id, pack_type, schedule_cron, enabled, last_run_at, next_run_at, created_by, created_at
       FROM export_jobs WHERE project_id = $1 ORDER BY created_at DESC`,
      [projectId],
    )
    return result.rows.map((row) => ({
      id: row.id as string,
      projectId: row.project_id as string,
      packType: row.pack_type as string,
      scheduleCron: row.schedule_cron as string,
      enabled: row.enabled as boolean,
      lastRunAt: row.last_run_at ? (row.last_run_at as Date).toISOString() : undefined,
      nextRunAt: row.next_run_at ? (row.next_run_at as Date).toISOString() : undefined,
      createdBy: row.created_by as string,
      createdAt: (row.created_at as Date).toISOString(),
    }))
  }
  return readJsonJobs().filter((job) => job.projectId === projectId)
}

export async function createExportJob(input: {
  projectId: string
  packType?: string
  scheduleCron?: string
  createdBy: string
}): Promise<ExportJob> {
  const job: ExportJob = {
    id: randomUUID(),
    projectId: input.projectId,
    packType: input.packType ?? 'close_pack',
    scheduleCron: input.scheduleCron ?? '0 6 1 * *',
    enabled: true,
    nextRunAt: nextMonthlyRun(),
    createdBy: input.createdBy,
    createdAt: new Date().toISOString(),
  }

  if (isPostgresEnabled()) {
    await query(
      `INSERT INTO export_jobs (id, project_id, pack_type, schedule_cron, enabled, next_run_at, created_by, created_at)
       VALUES ($1,$2,$3,$4,TRUE,$5,$6,$7)`,
      [job.id, job.projectId, job.packType, job.scheduleCron, job.nextRunAt, job.createdBy, job.createdAt],
    )
    return job
  }

  writeJsonJobs([job, ...readJsonJobs()])
  return job
}

export async function runDueExportJobs(
  runner: (projectId: string) => Promise<void>,
): Promise<number> {
  const now = new Date()
  let jobs: ExportJob[] = []

  if (isPostgresEnabled()) {
    const result = await query(
      `SELECT project_id FROM export_jobs WHERE enabled = TRUE AND (next_run_at IS NULL OR next_run_at <= $1)`,
      [now.toISOString()],
    )
    for (const row of result.rows) {
      await runner(row.project_id as string)
    }
    await query(
      `UPDATE export_jobs SET last_run_at = $1, next_run_at = $2 WHERE enabled = TRUE AND (next_run_at IS NULL OR next_run_at <= $1)`,
      [now.toISOString(), nextMonthlyRun()],
    )
    return result.rowCount ?? 0
  }

  jobs = readJsonJobs().filter((job) => job.enabled && (!job.nextRunAt || new Date(job.nextRunAt) <= now))
  for (const job of jobs) {
    await runner(job.projectId)
    job.lastRunAt = now.toISOString()
    job.nextRunAt = nextMonthlyRun()
  }
  writeJsonJobs(readJsonJobs().map((j) => jobs.find((x) => x.id === j.id) ?? j))
  return jobs.length
}

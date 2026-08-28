import { loadRootEnvFile } from './config/loadEnv.js'
import { createApp } from './app.js'
import { validateEnv } from './config/env.js'
import { closeDatabase, getProjectById, initDatabase, isUsingPostgres } from './db/database.js'
import { closePool, getPool } from './db/postgres.js'
import { runMigrations } from './db/migrate.js'
import { runDueExportJobs } from './services/exportScheduler.js'
import { generateClosePackPdfAsync } from './services/pdfExport.js'
import { getJwtSecret } from './auth/jwt.js'
import { ensureBootstrapAdmin } from './auth/userStore.js'
import { logger } from './utils/logger.js'
import { startIngestionWorker } from './services/ingestionWorker.js'
import { closeRedis } from './services/redisService.js'
import { pruneExpiredSessions } from './auth/sessionStore.js'

loadRootEnvFile()

const port = Number(process.env.API_PORT ?? process.env.PORT ?? 3001)

validateEnv()
getJwtSecret()

await runMigrations()
await initDatabase()
await ensureBootstrapAdmin()

async function executeScheduledExports() {
  const count = await runDueExportJobs(async (projectId) => {
    const state = await getProjectById(projectId)
    await generateClosePackPdfAsync(state, 'Scheduled export')
    logger.info('scheduled_export_generated', { projectId })
  })
  if (count > 0) {
    logger.info('scheduled_exports_completed', { count })
  }
}

async function runScheduledExports() {
  if (!isUsingPostgres()) {
    await executeScheduledExports()
    return
  }
  const client = await getPool().connect()
  try {
    const lock = await client.query<{ acquired: boolean }>(
      `SELECT pg_try_advisory_lock(hashtext('project-controls-export-scheduler')) AS acquired`,
    )
    if (!lock.rows[0]?.acquired) return
    try {
      await executeScheduledExports()
    } finally {
      await client.query(
        `SELECT pg_advisory_unlock(hashtext('project-controls-export-scheduler'))`,
      )
    }
  } finally {
    client.release()
  }
}

function triggerScheduledExports() {
  void runScheduledExports().catch((error) => {
    logger.error('scheduled_exports_failed', { error: error instanceof Error ? error.message : 'unknown' })
  })
}

triggerScheduledExports()
const exportInterval = setInterval(triggerScheduledExports, 60 * 60 * 1000)
const stopIngestionWorker =
  process.env.INGESTION_ASYNC === 'true' ? startIngestionWorker() : () => undefined
const sessionPruneInterval = setInterval(
  () => void pruneExpiredSessions().catch((error) =>
    logger.error('session_prune_failed', { error: error instanceof Error ? error.message : 'unknown' }),
  ),
  60 * 60 * 1000,
)

const app = createApp()
const server = app.listen(port, () => {
  logger.info('server_started', { port, store: isUsingPostgres() ? 'postgres' : 'json' })
})

let shuttingDown = false

function shutdown(signal: string) {
  if (shuttingDown) return
  shuttingDown = true
  logger.info('shutdown_started', { signal })
  clearInterval(exportInterval)
  stopIngestionWorker()
  clearInterval(sessionPruneInterval)
  server.close(() => {
    closeDatabase()
    void Promise.all([closePool(), closeRedis()]).finally(() => process.exit(0))
  })
  setTimeout(() => {
    logger.error('shutdown_forced', { timeoutMs: 10_000 })
    process.exit(1)
  }, 10_000).unref()
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))

// MUST be the first import: populates process.env from .env before any other
// module evaluates its module-level `process.env.*` constants (DATABASE_PATH,
// USERS_PATH, SESSION_TTL_SEC, ...). Imports are hoisted, so a plain function
// call after the import block would run too late.
import './config/loadEnv.js'
import { createApp } from './app.js'
import { validateEnv } from './config/env.js'
import { closeDatabase, getProjectById, initDatabase, isUsingPostgres } from './db/database.js'
import { closePool } from './db/postgres.js'
import { runMigrations } from './db/migrate.js'
import { runDueExportJobs } from './services/exportScheduler.js'
import { generateClosePackPdfAsync } from './services/pdfExport.js'
import { getJwtSecret } from './auth/jwt.js'
import { ensureBootstrapAdmin } from './auth/userStore.js'
import { logger } from './utils/logger.js'

const port = Number(process.env.API_PORT ?? process.env.PORT ?? 3001)

validateEnv()
getJwtSecret()

await runMigrations()
await initDatabase()
await ensureBootstrapAdmin()

/**
 * Never throws: a failing export job must not become an unhandled rejection
 * (which can kill the process) or stop the next hourly run.
 */
async function runScheduledExports(): Promise<void> {
  try {
    const count = await runDueExportJobs(async (projectId) => {
      const state = await getProjectById(projectId)
      await generateClosePackPdfAsync(state, 'Scheduled export')
      logger.info('scheduled export generated', { projectId })
    })
    if (count > 0) {
      logger.info('scheduled exports completed', { count })
    }
  } catch (error) {
    logger.error('scheduled export run failed', {
      message: error instanceof Error ? error.message : String(error),
    })
  }
}

void runScheduledExports()
const exportInterval = setInterval(() => void runScheduledExports(), 60 * 60 * 1000)

const app = createApp()
const server = app.listen(port, () => {
  logger.info('api listening', { port, store: isUsingPostgres() ? 'postgres' : 'json' })
})

let shuttingDown = false

function shutdown(signal: string) {
  if (shuttingDown) return
  shuttingDown = true
  logger.info('shutdown initiated', { signal })
  clearInterval(exportInterval)
  server.close(() => {
    closeDatabase()
    void closePool().finally(() => process.exit(0))
  })
  setTimeout(() => {
    logger.error('shutdown forced exit after timeout')
    process.exit(1)
  }, 10_000).unref()
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))

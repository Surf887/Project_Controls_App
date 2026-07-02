import { loadRootEnvFile } from './config/loadEnv.js'
import { createApp } from './app.js'
import { validateEnv } from './config/env.js'
import { closeDatabase, getProjectById, initDatabase, isUsingPostgres } from './db/database.js'
import { closePool } from './db/postgres.js'
import { runMigrations } from './db/migrate.js'
import { runDueExportJobs } from './services/exportScheduler.js'
import { generateClosePackPdfAsync } from './services/pdfExport.js'
import { getJwtSecret } from './auth/jwt.js'
import { ensureBootstrapAdmin } from './auth/userStore.js'

loadRootEnvFile()

const port = Number(process.env.API_PORT ?? process.env.PORT ?? 3001)

validateEnv()
getJwtSecret()

await runMigrations()
await initDatabase()
await ensureBootstrapAdmin()

async function runScheduledExports() {
  const count = await runDueExportJobs(async (projectId) => {
    const state = await getProjectById(projectId)
    await generateClosePackPdfAsync(state, 'Scheduled export')
    console.log(`[export] generated close pack for ${projectId}`)
  })
  if (count > 0) {
    console.log(`[export] completed ${count} scheduled job(s)`)
  }
}

void runScheduledExports()
const exportInterval = setInterval(() => void runScheduledExports(), 60 * 60 * 1000)

const app = createApp()
const server = app.listen(port, () => {
  console.log(`Project Controls API listening on http://localhost:${port} (${isUsingPostgres() ? 'postgres' : 'json'})`)
})

let shuttingDown = false

function shutdown(signal: string) {
  if (shuttingDown) return
  shuttingDown = true
  console.log(`[shutdown] ${signal} received, draining connections`)
  clearInterval(exportInterval)
  server.close(() => {
    closeDatabase()
    void closePool().finally(() => process.exit(0))
  })
  setTimeout(() => {
    console.error('[shutdown] forced exit after timeout')
    process.exit(1)
  }, 10_000).unref()
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))

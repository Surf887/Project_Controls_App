import { createApp } from './app.js'
import { closeDatabase, getProjectById, initDatabase, isUsingPostgres } from './db/database.js'
import { closePool } from './db/postgres.js'
import { runMigrations } from './db/migrate.js'
import { runDueExportJobs } from './services/exportScheduler.js'
import { generateClosePackPdfAsync } from './services/pdfExport.js'
import { getJwtSecret } from './auth/jwt.js'
import { ensureBootstrapAdmin } from './auth/userStore.js'

const port = Number(process.env.PORT ?? 3001)

// Fail fast at boot if the signing secret is misconfigured (throws in prod when
// JWT_SECRET is unset) rather than discovering it on the first request.
getJwtSecret()

if (process.env.NODE_ENV === 'production' && process.env.DEMO_AUTH === 'true') {
  throw new Error('DEMO_AUTH must not be enabled in production')
}

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
setInterval(() => void runScheduledExports(), 60 * 60 * 1000)

const app = createApp()
const server = app.listen(port, () => {
  console.log(`Project Controls API listening on http://localhost:${port} (${isUsingPostgres() ? 'postgres' : 'json'})`)
})

function shutdown() {
  server.close()
  closeDatabase()
  void closePool()
  process.exit(0)
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

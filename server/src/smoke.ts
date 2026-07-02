// Must be first so .env values are visible to module-level env reads.
import './config/loadEnv.js'
import { createApp } from './app.js'
import { initDatabase } from './db/database.js'
import { listProjects } from './db/database.js'
import { runMigrations } from './db/migrate.js'

await runMigrations()
await initDatabase()

const app = createApp()
const server = app.listen(0, () => {
  const address = server.address()
  const port = typeof address === 'object' && address ? address.port : 0
  void (async () => {
    try {
      const health = await fetch(`http://127.0.0.1:${port}/api/health`)
      if (!health.ok) throw new Error(`Health check failed: ${health.status}`)
      const projects = await listProjects()
      console.log(`smoke ok — port ${port}, projects ${projects.length}`)
      server.close()
      process.exit(0)
    } catch (error) {
      console.error('smoke failed', error)
      server.close()
      process.exit(1)
    }
  })()
})

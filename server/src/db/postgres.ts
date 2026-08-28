import pg from 'pg'
import { logger } from '../utils/logger.js'

let pool: pg.Pool | null = null

function positiveNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

export function isPostgresEnabled(): boolean {
  return Boolean(process.env.DATABASE_URL)
}

export function getPool(): pg.Pool {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL not configured')
  }
  if (!pool) {
    pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      max: Math.trunc(positiveNumber(process.env.DB_POOL_MAX, 10)),
      idleTimeoutMillis: positiveNumber(process.env.DB_IDLE_TIMEOUT_MS, 30_000),
      connectionTimeoutMillis: positiveNumber(process.env.DB_CONNECT_TIMEOUT_MS, 10_000),
      statement_timeout: positiveNumber(process.env.DB_STATEMENT_TIMEOUT_MS, 30_000),
      ssl:
        process.env.DATABASE_SSL === 'true'
          ? { rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false' }
          : undefined,
    })
  }
  return pool
}

export async function closePool() {
  if (pool) {
    await pool.end()
    pool = null
  }
}

export async function runSqlMigrations(): Promise<void> {
  if (!isPostgresEnabled()) {
    return
  }

  const fs = await import('node:fs')
  const path = await import('node:path')
  const { fileURLToPath } = await import('node:url')

  const __dirname = path.dirname(fileURLToPath(import.meta.url))
  const migrationsDir = path.join(__dirname, 'migrations')
  if (!fs.existsSync(migrationsDir)) {
    throw new Error(`Postgres migration assets not found: ${migrationsDir}`)
  }

  const client = await getPool().connect()
  try {
    // Only one replica may migrate at a time.
    await client.query(`SELECT pg_advisory_lock(hashtext('project-controls-schema-migrations'))`)
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)

    const files = fs.readdirSync(migrationsDir).filter((name) => name.endsWith('.sql')).sort()
    for (const file of files) {
      const id = file.replace(/\.sql$/, '')
      const applied = await client.query('SELECT 1 FROM schema_migrations WHERE id = $1', [id])
      if (applied.rowCount && applied.rowCount > 0) {
        continue
      }

      await client.query('BEGIN')
      try {
        const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8')
        await client.query(sql)
        await client.query('INSERT INTO schema_migrations (id) VALUES ($1)', [id])
        await client.query('COMMIT')
        logger.info('postgres_migration_applied', { migrationId: id })
      } catch (error) {
        await client.query('ROLLBACK')
        throw error
      }
    }
  } finally {
    await client.query(`SELECT pg_advisory_unlock(hashtext('project-controls-schema-migrations'))`).catch(() => {})
    client.release()
  }
}

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(text: string, params?: unknown[]) {
  return getPool().query<T>(text, params)
}

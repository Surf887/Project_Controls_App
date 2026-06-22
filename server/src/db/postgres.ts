import pg from 'pg'

let pool: pg.Pool | null = null

export function isPostgresEnabled(): boolean {
  return Boolean(process.env.DATABASE_URL)
}

export function getPool(): pg.Pool {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL not configured')
  }
  if (!pool) {
    pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
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
  const client = getPool()

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
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8')
    await client.query(sql)
    await client.query('INSERT INTO schema_migrations (id) VALUES ($1)', [id])
    console.log(`[postgres] applied migration ${id}`)
  }
}

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(text: string, params?: unknown[]) {
  return getPool().query<T>(text, params)
}

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const migrationsDir = path.join(__dirname, '..', 'db', 'migrations')
const dataDir = path.join(__dirname, '..', '..', 'data')

export interface Migration {
  id: string
  description: string
  up: () => void
}

const migrations: Migration[] = [
  {
    id: '001_init_projects_store',
    description: 'Ensure projects.json exists with schema version',
    up: () => {
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true })
      }
      const file = path.join(dataDir, 'projects.json')
      if (!fs.existsSync(file)) {
        fs.writeFileSync(file, JSON.stringify({ schemaVersion: 1, activeProjectId: null, projects: {} }, null, 2))
      }
    },
  },
  {
    id: '002_schema_version_field',
    description: 'Add schemaVersion to existing store if missing',
    up: () => {
      const file = path.join(dataDir, 'projects.json')
      if (!fs.existsSync(file)) {
        return
      }
      const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>
      if (raw.schemaVersion == null) {
        raw.schemaVersion = 1
        fs.writeFileSync(file, JSON.stringify(raw, null, 2))
      }
    },
  },
]

export function runMigrations() {
  const appliedFile = path.join(dataDir, '.migrations.json')
  let applied: string[] = []
  if (fs.existsSync(appliedFile)) {
    applied = JSON.parse(fs.readFileSync(appliedFile, 'utf8')) as string[]
  }

  for (const migration of migrations) {
    if (applied.includes(migration.id)) {
      continue
    }
    migration.up()
    applied.push(migration.id)
    fs.writeFileSync(appliedFile, JSON.stringify(applied, null, 2))
    console.log(`[migrate] ${migration.id}: ${migration.description}`)
  }
}

export function listMigrationFiles() {
  if (!fs.existsSync(migrationsDir)) {
    return []
  }
  return fs.readdirSync(migrationsDir).filter((name) => name.endsWith('.sql'))
}

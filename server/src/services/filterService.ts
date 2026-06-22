import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { isPostgresEnabled, query } from '../db/postgres.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const filtersPath = path.resolve(__dirname, '../../data/saved_filters.json')

export interface SavedFilterRecord {
  id: string
  userId: string
  scope: string
  name: string
  payload: Record<string, string>
  shared: boolean
  createdAt: string
}

function readJsonFilters(): SavedFilterRecord[] {
  if (!fs.existsSync(filtersPath)) return []
  return JSON.parse(fs.readFileSync(filtersPath, 'utf8')) as SavedFilterRecord[]
}

function writeJsonFilters(rows: SavedFilterRecord[]) {
  fs.mkdirSync(path.dirname(filtersPath), { recursive: true })
  fs.writeFileSync(filtersPath, JSON.stringify(rows, null, 2), 'utf8')
}

export async function listFilters(userId: string, scope?: string): Promise<SavedFilterRecord[]> {
  if (isPostgresEnabled()) {
    const result = scope
      ? await query<{ id: string; user_id: string; scope: string; name: string; payload: Record<string, string>; shared: boolean; created_at: Date }>(
          `SELECT * FROM saved_filters WHERE scope = $1 AND (user_id = $2 OR shared = TRUE) ORDER BY created_at DESC`,
          [scope, userId],
        )
      : await query<{ id: string; user_id: string; scope: string; name: string; payload: Record<string, string>; shared: boolean; created_at: Date }>(
          `SELECT * FROM saved_filters WHERE user_id = $1 OR shared = TRUE ORDER BY created_at DESC`,
          [userId],
        )
    return result.rows.map(mapRow)
  }
  return readJsonFilters().filter(
    (row) => (row.userId === userId || row.shared) && (!scope || row.scope === scope),
  )
}

function mapRow(row: {
  id: string
  user_id: string
  scope: string
  name: string
  payload: Record<string, string>
  shared: boolean
  created_at: Date
}): SavedFilterRecord {
  return {
    id: row.id,
    userId: row.user_id,
    scope: row.scope,
    name: row.name,
    payload: row.payload,
    shared: row.shared,
    createdAt: row.created_at.toISOString(),
  }
}

export async function saveFilter(input: Omit<SavedFilterRecord, 'id' | 'createdAt'>): Promise<SavedFilterRecord> {
  const record: SavedFilterRecord = {
    ...input,
    id: randomUUID(),
    createdAt: new Date().toISOString(),
  }

  if (isPostgresEnabled()) {
    await query(
      `INSERT INTO saved_filters (id, user_id, scope, name, payload, shared, created_at) VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7)`,
      [record.id, record.userId, record.scope, record.name, JSON.stringify(record.payload), record.shared, record.createdAt],
    )
    return record
  }

  writeJsonFilters([record, ...readJsonFilters()])
  return record
}

export async function deleteFilter(userId: string, filterId: string): Promise<boolean> {
  if (isPostgresEnabled()) {
    const result = await query('DELETE FROM saved_filters WHERE id = $1 AND user_id = $2', [filterId, userId])
    return (result.rowCount ?? 0) > 0
  }
  const rows = readJsonFilters()
  const next = rows.filter((row) => !(row.id === filterId && row.userId === userId))
  if (next.length === rows.length) return false
  writeJsonFilters(next)
  return true
}

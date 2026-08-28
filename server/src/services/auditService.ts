import { createHash, createHmac, randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { PoolClient } from 'pg'
import { assertSafeId, resolveUnderRoot } from '../utils/safePath.js'
import { getPool, isPostgresEnabled, query } from '../db/postgres.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
function resolveAuditDir(): string {
  return process.env.AUDIT_DIR ?? path.resolve(__dirname, '../../data/audit')
}

function auditPath(projectId: string): string {
  const safeId = assertSafeId(projectId, 'projectId')
  return resolveUnderRoot(resolveAuditDir(), `${safeId}.jsonl`)
}

function ensureAuditDir() {
  fs.mkdirSync(resolveAuditDir(), { recursive: true })
}

export interface ImmutableAuditEvent {
  seq: number
  id: string
  projectId: string
  at: string
  actor: string
  actorId: string
  team: string
  entityType: string
  entityId: string
  action: string
  summary: string
  prevHash: string
  hashAlgorithm?: 'hmac-sha256-v1' | 'hmac-sha256-v2'
  hash: string
  payload?: Record<string, unknown>
}

export type ImmutableAuditInput = Pick<
  ImmutableAuditEvent,
  'actor' | 'actorId' | 'team' | 'entityType' | 'entityId' | 'action' | 'summary' | 'payload'
>

function auditHmacSecret(): string {
  const secret = process.env.AUDIT_HMAC_SECRET
  if (secret) return secret
  if (process.env.NODE_ENV === 'production') {
    throw new Error('AUDIT_HMAC_SECRET is required in production')
  }
  return 'development-only-audit-secret'
}

function hashEntryV1(payload: Omit<ImmutableAuditEvent, 'hash'>): string {
  return createHmac('sha256', auditHmacSecret()).update(JSON.stringify(payload)).digest('hex')
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry ?? null)).join(',')}]`
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    return `{${Object.keys(record)
      .filter((key) => record[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
      .join(',')}}`
  }
  return JSON.stringify(value) ?? 'null'
}

function hashEntryV2(payload: Omit<ImmutableAuditEvent, 'hash'>): string {
  return createHmac('sha256', auditHmacSecret()).update(stableStringify(payload)).digest('hex')
}

function legacyHashEntry(payload: Omit<ImmutableAuditEvent, 'hash'>): string {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex')
}

function buildAuditEvent(
  seq: number,
  id: string,
  projectId: string,
  partial: ImmutableAuditInput,
  prevHash: string,
  at = new Date().toISOString(),
): ImmutableAuditEvent {
  const withoutHash = {
    seq,
    id,
    projectId,
    at,
    actor: partial.actor,
    actorId: partial.actorId,
    team: partial.team,
    entityType: partial.entityType,
    entityId: partial.entityId,
    action: partial.action,
    summary: partial.summary,
    ...(partial.payload ? { payload: partial.payload } : {}),
    prevHash,
    hashAlgorithm: 'hmac-sha256-v2' as const,
  }
  return { ...withoutHash, hash: hashEntryV2(withoutHash) }
}

function readLastEvent(projectId: string): ImmutableAuditEvent | null {
  const file = auditPath(projectId)
  if (!fs.existsSync(file)) {
    return null
  }
  const lines = fs.readFileSync(file, 'utf8').trim().split('\n').filter(Boolean)
  if (lines.length === 0) {
    return null
  }
  // A corrupt/partially-written trailing line must not throw here: this runs
  // inside the audit hook, which fires after the project write has already been
  // committed. Throwing would surface a false 500 and prompt the client to
  // retry an action that actually succeeded. Walk back to the last valid line.
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      return JSON.parse(lines[i]!) as ImmutableAuditEvent
    } catch {
      // skip corrupt line and try the previous one
    }
  }
  return null
}

export function appendImmutableAudit(
  projectId: string,
  partial: ImmutableAuditInput,
): ImmutableAuditEvent {
  ensureAuditDir()
  const last = readLastEvent(projectId)
  const seq = (last?.seq ?? 0) + 1
  const prevHash = last?.hash ?? 'GENESIS'

  const event = buildAuditEvent(seq, `AUD-${projectId}-${seq}`, projectId, partial, prevHash)

  fs.appendFileSync(auditPath(projectId), `${JSON.stringify(event)}\n`, 'utf8')
  return event
}

export function listImmutableAudit(projectId: string, limit = 200): ImmutableAuditEvent[] {
  const file = auditPath(projectId)
  if (!fs.existsSync(file)) {
    return []
  }
  const lines = fs.readFileSync(file, 'utf8').trim().split('\n').filter(Boolean)
  return lines
    .slice(-limit)
    .flatMap((line) => {
      try {
        return [JSON.parse(line) as ImmutableAuditEvent]
      } catch {
        return []
      }
    })
    .reverse()
}

function verifyEvents(events: ImmutableAuditEvent[]): { ok: boolean; errors: string[] } {
  const errors: string[] = []
  let prevHash = 'GENESIS'

  events.forEach((event, index) => {
    if (event.prevHash !== prevHash) {
      errors.push(`Event ${index + 1}: prevHash mismatch`)
    }
    const { hash: _hash, ...rest } = event
    let expected = legacyHashEntry(rest as Omit<ImmutableAuditEvent, 'hash'>)
    if (event.hashAlgorithm === 'hmac-sha256-v1') {
      expected = hashEntryV1(rest as Omit<ImmutableAuditEvent, 'hash'>)
    }
    if (event.hashAlgorithm === 'hmac-sha256-v2') {
      expected = hashEntryV2(rest as Omit<ImmutableAuditEvent, 'hash'>)
    }
    if (event.hash !== expected) {
      errors.push(`Event ${index + 1}: hash integrity failure`)
    }
    prevHash = event.hash
  })

  return { ok: errors.length === 0, errors }
}

export function verifyAuditChain(projectId: string): { ok: boolean; errors: string[] } {
  const file = auditPath(projectId)
  if (!fs.existsSync(file)) {
    return { ok: true, errors: [] }
  }

  const errors: string[] = []
  const events: ImmutableAuditEvent[] = []
  const lines = fs.readFileSync(file, 'utf8').trim().split('\n').filter(Boolean)
  lines.forEach((line, index) => {
    try {
      events.push(JSON.parse(line) as ImmutableAuditEvent)
    } catch {
      errors.push(`Line ${index + 1}: unparseable audit record`)
    }
  })
  const integrity = verifyEvents(events)
  return { ok: errors.length === 0 && integrity.ok, errors: [...errors, ...integrity.errors] }
}

interface AuditRow {
  seq: string | number
  id: string
  project_id: string
  actor_id: string
  actor_name: string
  team: string
  entity_type: string
  entity_id: string
  action: string
  summary: string
  payload: Record<string, unknown> | null
  prev_hash: string
  entry_hash: string
  created_at: Date | string
}

function eventFromRow(row: AuditRow): ImmutableAuditEvent {
  return {
    seq: Number(row.seq),
    id: row.id,
    projectId: row.project_id,
    at: row.created_at instanceof Date ? row.created_at.toISOString() : new Date(row.created_at).toISOString(),
    actor: row.actor_name,
    actorId: row.actor_id,
    team: row.team,
    entityType: row.entity_type,
    entityId: row.entity_id,
    action: row.action,
    summary: row.summary,
    ...(row.payload ? { payload: row.payload } : {}),
    prevHash: row.prev_hash,
    hashAlgorithm: 'hmac-sha256-v2',
    hash: row.entry_hash,
  }
}

const auditSelect = `
  SELECT seq, id, project_id, actor_id, actor_name, team, entity_type, entity_id,
         action, summary, payload, prev_hash, entry_hash, created_at
  FROM audit_events
`

/** Append inside the project-state transaction so state and audit commit atomically. */
export async function appendPostgresAudit(
  client: PoolClient,
  projectId: string,
  partial: ImmutableAuditInput,
): Promise<ImmutableAuditEvent> {
  const safeProjectId = assertSafeId(projectId, 'projectId')
  const last = await client.query<AuditRow>(
    `${auditSelect} WHERE project_id = $1 ORDER BY seq DESC LIMIT 1`,
    [safeProjectId],
  )
  const sequence = await client.query<{ seq: string }>(
    `SELECT nextval(pg_get_serial_sequence('audit_events', 'seq'))::text AS seq`,
  )
  const seq = Number(sequence.rows[0]!.seq)
  const event = buildAuditEvent(
    seq,
    `AUD-${safeProjectId}-${randomUUID()}`,
    safeProjectId,
    partial,
    last.rows[0]?.entry_hash ?? 'GENESIS',
  )
  await client.query(
    `INSERT INTO audit_events
      (seq, id, project_id, actor_id, actor_name, team, entity_type, entity_id,
       action, summary, payload, prev_hash, entry_hash, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13,$14)`,
    [
      event.seq,
      event.id,
      event.projectId,
      event.actorId,
      event.actor,
      event.team,
      event.entityType,
      event.entityId,
      event.action,
      event.summary,
      event.payload ? JSON.stringify(event.payload) : null,
      event.prevHash,
      event.hash,
      event.at,
    ],
  )
  return event
}

export async function appendImmutableAuditAsync(
  projectId: string,
  partial: ImmutableAuditInput,
): Promise<ImmutableAuditEvent> {
  if (!isPostgresEnabled()) return appendImmutableAudit(projectId, partial)
  const client = await getPool().connect()
  try {
    await client.query('BEGIN')
    await client.query('SELECT 1 FROM projects WHERE id = $1 FOR UPDATE', [
      assertSafeId(projectId, 'projectId'),
    ])
    const event = await appendPostgresAudit(client, projectId, partial)
    await client.query('COMMIT')
    return event
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw error
  } finally {
    client.release()
  }
}

export async function listImmutableAuditAsync(
  projectId: string,
  limit = 200,
): Promise<ImmutableAuditEvent[]> {
  if (!isPostgresEnabled()) return listImmutableAudit(projectId, limit)
  const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 1_000)
  const result = await query<AuditRow>(
    `${auditSelect} WHERE project_id = $1 ORDER BY seq DESC LIMIT $2`,
    [assertSafeId(projectId, 'projectId'), safeLimit],
  )
  return result.rows.map(eventFromRow)
}

export async function verifyAuditChainAsync(
  projectId: string,
): Promise<{ ok: boolean; errors: string[] }> {
  if (!isPostgresEnabled()) return verifyAuditChain(projectId)
  const result = await query<AuditRow>(
    `${auditSelect} WHERE project_id = $1 ORDER BY seq ASC`,
    [assertSafeId(projectId, 'projectId')],
  )
  return verifyEvents(result.rows.map(eventFromRow))
}

import bcrypt from 'bcryptjs'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import { isPostgresEnabled, query } from '../db/postgres.js'
import type { Role } from './roles.js'
import { logger } from '../utils/logger.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const usersPath = process.env.USERS_PATH ?? path.resolve(__dirname, '../../data/users.json')

const BCRYPT_ROUNDS = Number(process.env.BCRYPT_ROUNDS ?? 12)

export interface UserRecord {
  id: string
  email: string
  name: string
  role: Role
  provider: 'local' | 'oidc'
  passwordHash: string | null
  oidcSubject: string | null
  scimExternalId: string | null
  disabled: boolean
  createdAt: string
}

/** Shape safe to return over the API — never includes the password hash. */
export interface PublicUser {
  id: string
  email: string
  name: string
  role: Role
  provider: 'local' | 'oidc'
  disabled: boolean
}

export function toPublicUser(user: UserRecord): PublicUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    provider: user.provider,
    disabled: user.disabled,
  }
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

// ---------------------------------------------------------------------------
// JSON-file backing (default / no DATABASE_URL)
// ---------------------------------------------------------------------------

function readJsonUsers(): UserRecord[] {
  if (!fs.existsSync(usersPath)) return []
  return JSON.parse(fs.readFileSync(usersPath, 'utf8')) as UserRecord[]
}

function writeJsonUsers(rows: UserRecord[]): void {
  fs.mkdirSync(path.dirname(usersPath), { recursive: true })
  fs.writeFileSync(usersPath, JSON.stringify(rows, null, 2), 'utf8')
}

// ---------------------------------------------------------------------------
// Postgres backing
// ---------------------------------------------------------------------------

interface UserRow {
  id: string
  email: string
  name: string
  role: Role
  provider: 'local' | 'oidc'
  password_hash: string | null
  oidc_subject: string | null
  scim_external_id: string | null
  disabled: boolean
  created_at: string | Date
}

function rowToRecord(row: UserRow): UserRecord {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    provider: row.provider,
    passwordHash: row.password_hash,
    oidcSubject: row.oidc_subject,
    scimExternalId: row.scim_external_id,
    disabled: row.disabled,
    createdAt: typeof row.created_at === 'string' ? row.created_at : row.created_at.toISOString(),
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function countUsers(): Promise<number> {
  if (isPostgresEnabled()) {
    const result = await query<{ count: string }>('SELECT COUNT(*)::text AS count FROM users')
    return Number(result.rows[0]?.count ?? '0')
  }
  return readJsonUsers().length
}

export async function listUserRecords(): Promise<UserRecord[]> {
  if (isPostgresEnabled()) {
    const result = await query<UserRow>('SELECT * FROM users ORDER BY created_at ASC')
    return result.rows.map(rowToRecord)
  }
  return readJsonUsers()
}

export async function listUsers(): Promise<PublicUser[]> {
  return (await listUserRecords()).map(toPublicUser)
}

export async function findUserByEmail(email: string): Promise<UserRecord | null> {
  const normalized = normalizeEmail(email)
  if (isPostgresEnabled()) {
    const result = await query<UserRow>('SELECT * FROM users WHERE LOWER(email) = $1', [normalized])
    return result.rows[0] ? rowToRecord(result.rows[0]) : null
  }
  return readJsonUsers().find((u) => normalizeEmail(u.email) === normalized) ?? null
}

export async function findUserById(id: string): Promise<UserRecord | null> {
  if (isPostgresEnabled()) {
    const result = await query<UserRow>('SELECT * FROM users WHERE id = $1', [id])
    return result.rows[0] ? rowToRecord(result.rows[0]) : null
  }
  return readJsonUsers().find((u) => u.id === id) ?? null
}

export async function findUserByOidcSubject(subject: string): Promise<UserRecord | null> {
  if (isPostgresEnabled()) {
    const result = await query<UserRow>('SELECT * FROM users WHERE oidc_subject = $1', [subject])
    return result.rows[0] ? rowToRecord(result.rows[0]) : null
  }
  return readJsonUsers().find((u) => u.oidcSubject === subject) ?? null
}

export async function findUserByScimExternalId(externalId: string): Promise<UserRecord | null> {
  if (isPostgresEnabled()) {
    const result = await query<UserRow>('SELECT * FROM users WHERE scim_external_id = $1', [externalId])
    return result.rows[0] ? rowToRecord(result.rows[0]) : null
  }
  return readJsonUsers().find((user) => user.scimExternalId === externalId) ?? null
}

export interface CreateUserInput {
  email: string
  name: string
  role: Role
  password?: string
  provider?: 'local' | 'oidc'
  oidcSubject?: string | null
  scimExternalId?: string | null
}

export async function createUser(input: CreateUserInput): Promise<UserRecord> {
  const email = normalizeEmail(input.email)
  const provider = input.provider ?? 'local'
  const passwordHash = input.password ? await bcrypt.hash(input.password, BCRYPT_ROUNDS) : null

  if (provider === 'local' && !passwordHash) {
    throw new Error('Local users require a password')
  }

  const record: UserRecord = {
    id: `usr-${randomUUID()}`,
    email,
    name: input.name,
    role: input.role,
    provider,
    passwordHash,
    oidcSubject: input.oidcSubject ?? null,
    scimExternalId: input.scimExternalId ?? null,
    disabled: false,
    createdAt: new Date().toISOString(),
  }

  if (isPostgresEnabled()) {
    await query(
      `INSERT INTO users (id, email, name, role, provider, password_hash, oidc_subject, scim_external_id, disabled, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        record.id,
        record.email,
        record.name,
        record.role,
        record.provider,
        record.passwordHash,
        record.oidcSubject,
        record.scimExternalId,
        record.disabled,
        record.createdAt,
      ],
    )
    return record
  }

  const rows = readJsonUsers()
  if (rows.some((u) => normalizeEmail(u.email) === email)) {
    throw new Error('A user with that email already exists')
  }
  rows.push(record)
  writeJsonUsers(rows)
  return record
}

export async function setUserRole(id: string, role: Role): Promise<void> {
  if (isPostgresEnabled()) {
    await query('UPDATE users SET role = $2, updated_at = NOW() WHERE id = $1', [id, role])
    return
  }
  const rows = readJsonUsers()
  const user = rows.find((u) => u.id === id)
  if (user) {
    user.role = role
    writeJsonUsers(rows)
  }
}

export async function setUserDisabled(id: string, disabled: boolean): Promise<void> {
  if (isPostgresEnabled()) {
    await query('UPDATE users SET disabled = $2, updated_at = NOW() WHERE id = $1', [id, disabled])
    return
  }
  const rows = readJsonUsers()
  const user = rows.find((u) => u.id === id)
  if (user) {
    user.disabled = disabled
    writeJsonUsers(rows)
  }
}

export async function updateProvisionedUser(
  id: string,
  patch: { email?: string; name?: string; role?: Role; disabled?: boolean; scimExternalId?: string },
): Promise<void> {
  if (isPostgresEnabled()) {
    await query(
      `UPDATE users
       SET email = COALESCE($2, email),
           name = COALESCE($3, name),
           role = COALESCE($4, role),
           disabled = COALESCE($5, disabled),
           scim_external_id = COALESCE($6, scim_external_id),
           updated_at = NOW()
       WHERE id = $1`,
      [
        id,
        patch.email ? normalizeEmail(patch.email) : null,
        patch.name ?? null,
        patch.role ?? null,
        patch.disabled ?? null,
        patch.scimExternalId ?? null,
      ],
    )
    return
  }
  const rows = readJsonUsers()
  const user = rows.find((entry) => entry.id === id)
  if (!user) return
  if (patch.email) user.email = normalizeEmail(patch.email)
  if (patch.name) user.name = patch.name
  if (patch.role) user.role = patch.role
  if (patch.disabled != null) user.disabled = patch.disabled
  if (patch.scimExternalId) user.scimExternalId = patch.scimExternalId
  writeJsonUsers(rows)
}

/** Constant-time-ish password check via bcrypt. Returns false for OIDC users. */
export async function verifyUserPassword(user: UserRecord, password: string): Promise<boolean> {
  if (!user.passwordHash) return false
  return bcrypt.compare(password, user.passwordHash)
}

/**
 * Idempotent bootstrap: if no users exist and ADMIN_EMAIL/ADMIN_PASSWORD are set,
 * create the first admin. Lets a fresh deployment log in without a manual seed.
 */
export async function ensureBootstrapAdmin(): Promise<void> {
  const email = process.env.ADMIN_EMAIL
  const password = process.env.ADMIN_PASSWORD
  if ((await countUsers()) > 0) return
  if (!email || !password) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD are required when initializing an empty production user store')
    }
    return
  }
  if (process.env.NODE_ENV === 'production' && password.length < 12) {
    throw new Error('ADMIN_PASSWORD must be at least 12 characters in production')
  }
  await createUser({
    email,
    name: process.env.ADMIN_NAME ?? 'Administrator',
    role: 'admin',
    password,
    provider: 'local',
  })
  logger.info('bootstrap_admin_created', { email: normalizeEmail(email) })
}

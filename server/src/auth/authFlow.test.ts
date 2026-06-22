import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'
import { randomUUID } from 'node:crypto'

// Isolate the JSON user store to a temp file and pin a test signing secret.
const tmpUsers = path.join(os.tmpdir(), `pc-users-${randomUUID()}.json`)
process.env.USERS_PATH = tmpUsers
process.env.JWT_SECRET = 'test-secret-at-least-16-chars-long'
process.env.ADMIN_EMAIL = 'admin@example.com'
process.env.ADMIN_PASSWORD = 'admin-password-123'
delete process.env.DEMO_AUTH
delete process.env.DATABASE_URL
delete process.env.ENFORCE_PROJECT_MEMBERSHIP

// Imported dynamically so the env above is in place first.
type Mod = {
  app: typeof import('../app.js')
  jwt: typeof import('./jwt.js')
  store: typeof import('./userStore.js')
}
const mod = {} as Mod

beforeAll(async () => {
  mod.jwt = await import('./jwt.js')
  mod.store = await import('./userStore.js')
  mod.app = await import('../app.js')
  await mod.store.ensureBootstrapAdmin()
})

afterAll(() => {
  if (fs.existsSync(tmpUsers)) fs.unlinkSync(tmpUsers)
})

describe('session JWT', () => {
  it('signs and verifies a round-trip token', async () => {
    const token = await mod.jwt.signSessionToken({ id: 'u1', name: 'A', role: 'admin' })
    const claims = await mod.jwt.verifySessionToken(token)
    expect(claims?.sub).toBe('u1')
    expect(claims?.role).toBe('admin')
  })

  it('rejects a tampered token', async () => {
    const token = await mod.jwt.signSessionToken({ id: 'u1', name: 'A', role: 'viewer' })
    const tampered = token.slice(0, -3) + 'aaa'
    expect(await mod.jwt.verifySessionToken(tampered)).toBeNull()
  })

  it('rejects a token signed with a different secret', async () => {
    const token = await mod.jwt.signSessionToken({ id: 'u1', name: 'A', role: 'viewer' })
    process.env.JWT_SECRET = 'a-completely-different-secret-value'
    const result = await mod.jwt.verifySessionToken(token)
    process.env.JWT_SECRET = 'test-secret-at-least-16-chars-long'
    expect(result).toBeNull()
  })
})

describe('password auth flow', () => {
  it('rejects unauthenticated access (no privileged fallback)', async () => {
    const app = mod.app.createApp()
    const res = await request(app).get('/api/projects')
    expect(res.status).toBe(401)
  })

  it('does NOT accept a literal "Bearer admin" token (bypass removed)', async () => {
    const app = mod.app.createApp()
    const res = await request(app).get('/api/projects').set('Authorization', 'Bearer admin')
    expect(res.status).toBe(401)
  })

  it('ignores x-pc-role when DEMO_AUTH is off', async () => {
    const app = mod.app.createApp()
    const res = await request(app).get('/api/projects').set('x-pc-role', 'admin')
    expect(res.status).toBe(401)
  })

  it('logs in the bootstrap admin and rejects bad passwords', async () => {
    const app = mod.app.createApp()
    const bad = await request(app)
      .post('/api/platform/auth/login')
      .send({ email: 'admin@example.com', password: 'wrong' })
    expect(bad.status).toBe(401)

    const ok = await request(app)
      .post('/api/platform/auth/login')
      .send({ email: 'admin@example.com', password: 'admin-password-123' })
    expect(ok.status).toBe(200)
    expect(ok.body.token).toBeTruthy()
    expect(ok.body.user.role).toBe('admin')
    expect(ok.body.user.passwordHash).toBeUndefined()
  })

  it('admin can register a user who can then log in; non-admin cannot register', async () => {
    const app = mod.app.createApp()
    const login = await request(app)
      .post('/api/platform/auth/login')
      .send({ email: 'admin@example.com', password: 'admin-password-123' })
    const adminToken = login.body.token as string

    const created = await request(app)
      .post('/api/platform/auth/register')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ email: 'ctrl@example.com', name: 'Ctrl', role: 'cost_controller', password: 'controller-pw-1' })
    expect(created.status).toBe(201)

    const asUser = await request(app)
      .post('/api/platform/auth/login')
      .send({ email: 'ctrl@example.com', password: 'controller-pw-1' })
    expect(asUser.status).toBe(200)
    const userToken = asUser.body.token as string

    // A cost_controller cannot create users.
    const forbidden = await request(app)
      .post('/api/platform/auth/register')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ email: 'x@example.com', name: 'X', role: 'admin', password: 'password-1234' })
    expect(forbidden.status).toBe(403)
  })

  it('validates registration payloads (weak password rejected)', async () => {
    const app = mod.app.createApp()
    const login = await request(app)
      .post('/api/platform/auth/login')
      .send({ email: 'admin@example.com', password: 'admin-password-123' })
    const res = await request(app)
      .post('/api/platform/auth/register')
      .set('Authorization', `Bearer ${login.body.token}`)
      .send({ email: 'weak@example.com', name: 'W', role: 'viewer', password: 'short' })
    expect(res.status).toBe(400)
  })
})

describe('project membership enforcement (IDOR)', () => {
  it('denies a non-member viewer when enforcement is on', async () => {
    process.env.ENFORCE_PROJECT_MEMBERSHIP = 'true'
    const app = mod.app.createApp()
    const token = await mod.jwt.signSessionToken({ id: 'stranger', name: 'S', role: 'viewer' })
    const res = await request(app)
      .get('/api/projects/some-project-id')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(403)
    delete process.env.ENFORCE_PROJECT_MEMBERSHIP
  })
})

describe('auth config endpoint', () => {
  it('reports available login options without leaking secrets', async () => {
    const app = mod.app.createApp()
    const res = await request(app).get('/api/platform/auth/config')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ demoAuthEnabled: false, oidcEnabled: false })
  })
})

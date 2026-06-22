import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import { createApp } from '../app.js'
import { closeDatabase, initDatabase } from '../db/database.js'
import { runMigrations } from '../db/migrate.js'

describe('API routes', () => {
  beforeAll(async () => {
    process.env.DEMO_AUTH = 'true'
    runMigrations()
    await initDatabase()
  })

  afterAll(() => {
    closeDatabase()
  })

  const app = createApp()

  it('GET /api/health returns ok', async () => {
    const res = await request(app).get('/api/health')
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
  })

  it('GET /api/projects lists projects', async () => {
    const res = await request(app).get('/api/projects')
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.projects)).toBe(true)
  })

  it('GET /api/projects/active returns state', async () => {
    const res = await request(app).get('/api/projects/active')
    expect(res.status).toBe(200)
    expect(res.body.state).toBeDefined()
    expect(res.body.state.costSheetRows).toBeDefined()
  })

  it('POST /api/projects/:id/actions rejects invalid payload', async () => {
    const active = await request(app).get('/api/projects/active')
    const projectId = active.body.state.meta.id as string
    const res = await request(app).post(`/api/projects/${projectId}/actions`).send({})
    expect(res.status).toBe(400)
  })

  it('GET compute forecast uses control-account totals', async () => {
    const active = await request(app).get('/api/projects/active')
    const projectId = active.body.state.meta.id as string
    const res = await request(app).get(`/api/projects/${projectId}/compute/forecast`)
    expect(res.status).toBe(200)
    expect(res.body.totals.eacMostLikely).toBeGreaterThan(0)
  })

  it('GET /api/projects/:id/audit returns immutable log', async () => {
    const active = await request(app).get('/api/projects/active').set('x-pc-role', 'viewer')
    const projectId = active.body.state.meta.id as string
    const res = await request(app).get(`/api/projects/${projectId}/audit`).set('x-pc-role', 'viewer')
    expect(res.status).toBe(200)
    expect(res.body.integrity).toBeDefined()
    expect(Array.isArray(res.body.events)).toBe(true)
  })

  it('POST actions rejects ADD_AUDIT from client', async () => {
    const active = await request(app).get('/api/projects/active').set('x-pc-role', 'cost_controller')
    const projectId = active.body.state.meta.id as string
    const res = await request(app)
      .post(`/api/projects/${projectId}/actions`)
      .set('x-pc-role', 'cost_controller')
      .send({ type: 'ADD_AUDIT', payload: { id: 'fake', at: '', actor: 'x', team: 'x', entityType: 'change', entityId: 'x', action: 'x', summary: 'x' } })
    expect(res.status).toBe(403)
  })

  it('GET close-pack export returns leadership bundle', async () => {
    const active = await request(app).get('/api/projects/active').set('x-pc-role', 'viewer')
    const projectId = active.body.state.meta.id as string
    const res = await request(app)
      .get(`/api/projects/${projectId}/exports/close-pack`)
      .set('x-pc-role', 'viewer')
    expect(res.status).toBe(200)
    expect(res.body.files.length).toBeGreaterThan(0)
  })

  it('POST /api/platform/auth/token returns JWT', async () => {
    const res = await request(app)
      .post('/api/platform/auth/token')
      .send({ role: 'cost_controller' })
    expect(res.status).toBe(200)
    expect(res.body.token).toBeTruthy()
    expect(res.body.user.role).toBe('cost_controller')
  })

  it('GET /api/platform/portfolio/governance returns rollup', async () => {
    const res = await request(app).get('/api/platform/portfolio/governance').set('x-pc-role', 'viewer')
    expect(res.status).toBe(200)
    expect(res.body.rollup).toBeDefined()
    expect(res.body.policy).toBeDefined()
  })

  it('POST actions rejects unknown action types', async () => {
    const active = await request(app).get('/api/projects/active').set('x-pc-role', 'admin')
    const projectId = active.body.state.meta.id as string
    const res = await request(app)
      .post(`/api/projects/${projectId}/actions`)
      .set('x-pc-role', 'admin')
      .send({ type: 'NOT_A_REAL_ACTION', payload: {} })
    expect(res.status).toBe(400)
  })

  it('APPLY_APPROVED_EXTRACTIONS is allowed for cost_controller', async () => {
    const active = await request(app).get('/api/projects/active').set('x-pc-role', 'cost_controller')
    const projectId = active.body.state.meta.id as string
    const res = await request(app)
      .post(`/api/projects/${projectId}/actions`)
      .set('x-pc-role', 'cost_controller')
      .send({ type: 'APPLY_APPROVED_EXTRACTIONS', payload: { actor: 'Cost Controller' } })
    expect(res.status).toBe(200)
  })

  it('APPLY_APPROVED_EXTRACTIONS is forbidden for viewer', async () => {
    const active = await request(app).get('/api/projects/active').set('x-pc-role', 'viewer')
    const projectId = active.body.state.meta.id as string
    const res = await request(app)
      .post(`/api/projects/${projectId}/actions`)
      .set('x-pc-role', 'viewer')
      .send({ type: 'APPLY_APPROVED_EXTRACTIONS', payload: { actor: 'Viewer' } })
    expect(res.status).toBe(403)
  })

  it('GET close-pack PDF returns application/pdf', async () => {
    const active = await request(app).get('/api/projects/active').set('x-pc-role', 'viewer')
    const projectId = active.body.state.meta.id as string
    const res = await request(app)
      .get(`/api/projects/${projectId}/exports/close-pack.pdf`)
      .set('x-pc-role', 'viewer')
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toContain('application/pdf')
  })
})

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import { pendingApplyCount } from '@pc/engine/applyExtractionsCore.js'
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
    const res = await request(app).get('/api/health').set('x-request-id', 'health-test-1')
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    expect(res.body.ready).toBe(true)
    expect(res.headers['x-request-id']).toBe('health-test-1')
  })

  it('GET /api/projects lists projects', async () => {
    const res = await request(app).get('/api/projects')
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.projects)).toBe(true)
  })

  it('GET /api/projects/active returns state', async () => {
    const res = await request(app).get('/api/projects/active').set('x-pc-role', 'viewer')
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

  it('POST actions rejects a malformed If-Match version', async () => {
    const active = await request(app).get('/api/projects/active').set('x-pc-role', 'viewer')
    const projectId = active.body.state.meta.id as string
    const res = await request(app)
      .post(`/api/projects/${projectId}/actions`)
      .set('x-pc-role', 'viewer')
      .set('If-Match', 'not-a-version')
      .send({ type: 'SET_SELECTED_VALUE', payload: active.body.state.selectedValueId })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/positive integer/)
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

  it('LOCK_REPORTING_PERIOD rejects when approved extractions are pending apply', async () => {
    const active = await request(app).get('/api/projects/active').set('x-pc-role', 'admin')
    const projectId = active.body.state.meta.id as string
    const period = active.body.state.settings.reportingPeriod.period as string
    const values = [
      ...active.body.state.values,
      {
        id: 'v-lock-guard-test',
        reportId: 'rpt-lock-test',
        field: 'Pending forecast',
        category: 'forecast',
        rawValue: '50000000',
        normalizedValue: 50_000_000,
        unit: 'USD',
        period: '2026-W23',
        wbs: 'A.02',
        cbs: 'C-1000',
        standardMapping: '',
        confidence: 0.9,
        reviewStatus: 'approved',
        approvalStatus: 'approved',
        reviewer: 'Tester',
        owner: 'Cost Control',
        source: { document: 'd', table: 't', row: '1', column: 'c', anchor: 'a' },
        validationIssues: [],
        correctionHistory: [],
      },
    ]
    const setRes = await request(app)
      .post(`/api/projects/${projectId}/actions`)
      .set('x-pc-role', 'admin')
      .send({ type: 'SET_VALUES', payload: values })
    expect(setRes.status).toBe(200)
    expect(pendingApplyCount(setRes.body.state.values)).toBeGreaterThan(0)

    const res = await request(app)
      .post(`/api/projects/${projectId}/actions`)
      .set('x-pc-role', 'approver')
      .send({ type: 'LOCK_REPORTING_PERIOD', payload: { actor: 'PM', period } })
    expect(res.status).toBe(400)
    expect(String(res.body.error)).toMatch(/approved extraction/i)
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

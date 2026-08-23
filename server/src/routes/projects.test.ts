import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import { pendingApplyCount } from '@pc/engine/applyExtractionsCore.js'
import { createApp } from '../app.js'
import { closeDatabase, initDatabase } from '../db/database.js'
import { runMigrations } from '../db/migrate.js'
import { buildP6CsvImport, inspectP6Csv, sampleP6Csv } from '@pc/utils/p6CsvImport.js'

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

  it('protects Prometheus metrics with a bearer token', async () => {
    process.env.METRICS_TOKEN = 'metrics-test-token-long'
    const denied = await request(app).get('/api/metrics')
    expect(denied.status).toBe(401)

    const allowed = await request(app)
      .get('/api/metrics')
      .set('Authorization', 'Bearer metrics-test-token-long')
    expect(allowed.status).toBe(200)
    expect(allowed.text).toContain('project_controls_http_requests_total')
    delete process.env.METRICS_TOKEN
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

  it('POST actions imports a validated P6 schedule batch', async () => {
    const active = await request(app).get('/api/projects/active').set('x-pc-role', 'cost_controller')
    const projectId = active.body.state.meta.id as string
    const text = sampleP6Csv()
    const imported = buildP6CsvImport(text, {
      fileName: 'p6-status.csv',
      dataDate: '2026-06-30',
      importedBy: 'Planner',
      knownWbs: (active.body.state.costSheetRows as Array<{ parentId: string | null; wbs: string }>)
        .filter((row) => row.parentId === null)
        .map((row) => row.wbs),
      columnMap: inspectP6Csv(text).suggestedMap,
      now: '2026-08-05T00:00:00.000Z',
    })
    const res = await request(app)
      .post(`/api/projects/${projectId}/actions`)
      .set('x-pc-role', 'cost_controller')
      .send({ type: 'IMPORT_SCHEDULE', payload: imported })

    expect(res.status).toBe(200)
    expect(res.body.state.scheduleActivities).toHaveLength(3)
    expect(res.body.state.scheduleRelationships).toHaveLength(2)
  })

  it('ingests a privacy-first document into draft forecast drivers', async () => {
    const active = await request(app).get('/api/projects/active').set('x-pc-role', 'cost_controller')
    const projectId = active.body.state.meta.id as string
    const ingested = await request(app)
      .post(`/api/projects/${projectId}/documents/ingest`)
      .set('x-pc-role', 'cost_controller')
      .field('provider', 'local')
      .attach(
        'file',
        Buffer.from('Contractor forecast overrun for A.01 is USD 2.4 million with 60% probability.'),
        { filename: 'forecast.txt', contentType: 'text/plain' },
      )

    expect(ingested.status).toBe(201)
    expect(ingested.body.document.status).toBe('review_required')
    expect(ingested.body.drivers[0]).toMatchObject({
      status: 'draft',
      sourceType: 'document',
      mostLikelyUsd: 2_400_000,
      probability: 0.6,
    })

    const listed = await request(app)
      .get(`/api/projects/${projectId}/documents`)
      .set('x-pc-role', 'viewer')
    expect(listed.body.documents.some((document: { id: string }) => document.id === ingested.body.document.id)).toBe(true)
  })

  it('reports Snowflake configuration without exposing credentials', async () => {
    const active = await request(app).get('/api/projects/active').set('x-pc-role', 'viewer')
    const projectId = active.body.state.meta.id as string
    const status = await request(app)
      .get(`/api/projects/${projectId}/snowflake/status`)
      .set('x-pc-role', 'viewer')
    expect(status.status).toBe(200)
    expect(status.body.configured).toBe(false)
    expect(status.body).not.toHaveProperty('password')
    expect(status.body).not.toHaveProperty('token')
  })

  it('reports Planview configuration without exposing credentials', async () => {
    const active = await request(app).get('/api/projects/active').set('x-pc-role', 'viewer')
    const projectId = active.body.state.meta.id as string
    const status = await request(app)
      .get(`/api/projects/${projectId}/planview/status`)
      .set('x-pc-role', 'viewer')
    expect(status.status).toBe(200)
    expect(status.body.configured).toBe(false)
    expect(status.body).not.toHaveProperty('clientSecret')
    expect(status.body).not.toHaveProperty('token')
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

import { Router } from 'express'
import { listProjectRoles, setProjectRole } from '../auth/projectRoles.js'
import { attachProjectRole, requireAdmin, requireRole } from '../middleware/auth.js'
import { requireWebhookSignature } from '../integrations/webhookAuth.js'
import { projectRoleSchema, saveFilterSchema, workflowDelegationSchema, exportJobSchema, integrationSyncSchema, connectorOAuthSchema } from '../validation/schemas.js'
import { deleteFilter, listFilters, saveFilter } from '../services/filterService.js'
import { createExportJob, listExportJobs } from '../services/exportScheduler.js'
import { enterpriseWorkflows } from '@pc/data/workflowConfig.js'
import { isPostgresEnabled, query } from '../db/postgres.js'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getActiveProject } from '../db/database.js'
import { defaultPortfolioPolicy, rollupPortfolio } from '../services/portfolioService.js'
import { handleWebhook, listAdaptersByDomain, saveConnectorOAuth, runSyncJob } from '../integrations/connectorRegistry.js'
import type { IntegrationDomain } from '../integrations/connectorRegistry.js'
import { sendRouteError } from '../utils/routeError.js'
import { param } from '../utils/params.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const delegationsPath = path.resolve(__dirname, '../../data/workflow_delegations.json')

export const platformRouter = Router()

// Project-scoped platform routes (roles, export jobs) must enforce per-project
// membership, not just the global role.
platformRouter.use('/projects/:projectId', attachProjectRole)

platformRouter.get('/filters', requireRole('viewer'), async (req, res) => {
  const scope = req.query.scope?.toString()
  const filters = await listFilters(req.user!.id, scope)
  res.json({ filters })
})

platformRouter.post('/filters', requireRole('viewer'), async (req, res) => {
  const parsed = saveFilterSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid filter payload', issues: parsed.error.flatten() })
    return
  }
  const filter = await saveFilter({
    userId: req.user!.id,
    name: parsed.data.name,
    scope: parsed.data.scope,
    payload: parsed.data.payload,
    shared: parsed.data.shared ?? false,
  })
  res.status(201).json({ filter })
})

platformRouter.delete('/filters/:filterId', requireRole('viewer'), async (req, res) => {
  const ok = await deleteFilter(req.user!.id, param(req.params.filterId))
  if (!ok) {
    res.status(404).json({ error: 'Filter not found' })
    return
  }
  res.status(204).send()
})

platformRouter.get('/workflows', requireRole('viewer'), (_req, res) => {
  res.json({ workflows: enterpriseWorkflows })
})

platformRouter.get('/workflows/delegations', requireRole('viewer'), async (_req, res) => {
  if (isPostgresEnabled()) {
    const result = await query('SELECT * FROM workflow_delegations ORDER BY created_at DESC LIMIT 50')
    res.json({ delegations: result.rows })
    return
  }
  if (!fs.existsSync(delegationsPath)) {
    res.json({ delegations: [] })
    return
  }
  res.json({ delegations: JSON.parse(fs.readFileSync(delegationsPath, 'utf8')) })
})

platformRouter.post('/workflows/delegations', requireAdmin, async (req, res) => {
  const parsed = workflowDelegationSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid delegation payload', issues: parsed.error.flatten() })
    return
  }
  const body = parsed.data
  const record = { id: randomUUID(), ...body, createdAt: new Date().toISOString() }

  if (isPostgresEnabled()) {
    await query(
      `INSERT INTO workflow_delegations (id, workflow_id, project_id, from_user_id, to_user_id, until, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,NOW())`,
      [record.id, body.workflowId, body.projectId ?? null, body.fromUserId, body.toUserId, body.until],
    )
  } else {
    const rows = fs.existsSync(delegationsPath)
      ? (JSON.parse(fs.readFileSync(delegationsPath, 'utf8')) as unknown[])
      : []
    fs.mkdirSync(path.dirname(delegationsPath), { recursive: true })
    fs.writeFileSync(delegationsPath, JSON.stringify([record, ...rows], null, 2), 'utf8')
  }
  res.status(201).json({ delegation: record })
})

platformRouter.get('/portfolio/governance', requireRole('viewer'), async (_req, res) => {
  try {
    const state = await getActiveProject()
    res.json({ policy: defaultPortfolioPolicy, rollup: rollupPortfolio(state) })
  } catch (error) {
    sendRouteError(res, error, 503, 'Portfolio rollup unavailable')
  }
})

platformRouter.get('/projects/:projectId/roles', requireAdmin, async (req, res) => {
  res.json({ roles: await listProjectRoles(param(req.params.projectId)) })
})

platformRouter.post('/projects/:projectId/roles', requireAdmin, async (req, res) => {
  const parsed = projectRoleSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid role assignment', issues: parsed.error.flatten() })
    return
  }
  await setProjectRole(parsed.data.userId, param(req.params.projectId), parsed.data.role)
  res.status(201).json({ ok: true })
})

platformRouter.post('/integrations/oauth/:connectorId', requireAdmin, async (req, res) => {
  const parsed = connectorOAuthSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid OAuth payload' })
    return
  }
  await saveConnectorOAuth(param(req.params.connectorId), parsed.data)
  res.json({ ok: true, connectorId: param(req.params.connectorId) })
})

platformRouter.post('/integrations/sync', requireAdmin, async (req, res) => {
  const parsed = integrationSyncSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid sync payload', issues: parsed.error.flatten() })
    return
  }
  const job = await runSyncJob({
    connectorId: parsed.data.connectorId,
    domain: parsed.data.domain,
    direction: 'inbound',
    projectId: parsed.data.projectId,
  })
  res.json({ job })
})

platformRouter.get('/integrations/adapters', requireRole('viewer'), (req, res) => {
  const domain = req.query.domain as IntegrationDomain | undefined
  res.json({ adapters: listAdaptersByDomain(domain) })
})

platformRouter.post('/webhooks/:connectorId', requireWebhookSignature, async (req, res) => {
  const result = await handleWebhook(param(req.params.connectorId), req.body)
  res.status(result.ok ? 200 : 422).json(result)
})

platformRouter.get('/projects/:projectId/export-jobs', requireRole('viewer'), async (req, res) => {
  res.json({ jobs: await listExportJobs(param(req.params.projectId)) })
})

platformRouter.post('/projects/:projectId/export-jobs', requireRole('cost_controller'), async (req, res) => {
  const parsed = exportJobSchema.safeParse(req.body ?? {})
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid export job payload', issues: parsed.error.flatten() })
    return
  }
  const job = await createExportJob({
    projectId: param(req.params.projectId),
    createdBy: req.user!.name,
    scheduleCron: parsed.data.scheduleCron,
  })
  res.status(201).json({ job })
})

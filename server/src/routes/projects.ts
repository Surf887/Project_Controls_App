import { Router } from 'express'
import {
  applyAction,
  getActiveProjectRecord,
  getProjectById,
  getProjectRecord,
  listProjects,
  resetProject,
  setActiveProject,
  VersionConflictError,
} from '../db/database.js'
import type { ProjectAction } from '@pc/store/types.js'
import { attachProjectRole, guardProjectAction, requireAdmin, requireRole } from '../middleware/auth.js'
import { parseProjectAction } from '../validation/schemas.js'
import { computeProjectEvm, computeProjectForecast } from '../services/computeService.js'
import { param } from '../utils/params.js'

export const projectsRouter = Router()

projectsRouter.get('/', requireRole('viewer'), async (_req, res) => {
  res.json({ projects: await listProjects() })
})

projectsRouter.get('/active', requireRole('viewer'), async (_req, res) => {
  const record = await getActiveProjectRecord()
  res.json({ state: record.state, version: record.version })
})

projectsRouter.use('/:projectId', attachProjectRole)

projectsRouter.get('/:projectId', requireRole('viewer'), async (req, res) => {
  try {
    const projectId = param(req.params.projectId)
    const record = await getProjectRecord(projectId)
    res.json({ state: record.state, version: record.version })
  } catch (error) {
    res.status(404).json({ error: error instanceof Error ? error.message : 'Not found' })
  }
})

projectsRouter.post('/:projectId/activate', async (req, res) => {
  try {
    const record = await setActiveProject(param(req.params.projectId))
    res.json({ state: record.state, version: record.version })
  } catch (error) {
    res.status(404).json({ error: error instanceof Error ? error.message : 'Not found' })
  }
})

projectsRouter.post('/:projectId/actions', guardProjectAction, async (req, res) => {
  try {
    const parsed = parseProjectAction(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid action payload', issues: parsed.error.flatten() })
      return
    }
    const action = parsed.data as ProjectAction
    const expectedVersion = req.headers['if-match'] ? Number(req.headers['if-match']) : undefined
    const result = await applyAction(param(req.params.projectId), action, req.user ?? undefined, expectedVersion)
    res.setHeader('X-State-Version', String(result.version))
    res.json({ state: result.state, version: result.version })
  } catch (error) {
    if (error instanceof VersionConflictError) {
      res.status(409).json({ error: error.message, version: error.currentVersion })
      return
    }
    res.status(400).json({ error: error instanceof Error ? error.message : 'Action failed' })
  }
})

projectsRouter.post('/:projectId/reset', requireAdmin, async (req, res) => {
  try {
    const record = await resetProject(param(req.params.projectId))
    res.json({ state: record.state, version: record.version })
  } catch (error) {
    res.status(404).json({ error: error instanceof Error ? error.message : 'Reset failed' })
  }
})

export const computeRouter = Router({ mergeParams: true })

computeRouter.get('/forecast', async (req, res) => {
  try {
    const projectId = param((req.params as { projectId?: string }).projectId)
    const state = await getProjectById(projectId)
    const { snapshots, totals } = computeProjectForecast(state)
    res.json({ totals, rows: snapshots.length })
  } catch (error) {
    res.status(404).json({ error: error instanceof Error ? error.message : 'Compute failed' })
  }
})

computeRouter.get('/evm', async (req, res) => {
  try {
    const projectId = param((req.params as { projectId?: string }).projectId)
    const state = await getProjectById(projectId)
    res.json(computeProjectEvm(state))
  } catch (error) {
    res.status(404).json({ error: error instanceof Error ? error.message : 'Compute failed' })
  }
})

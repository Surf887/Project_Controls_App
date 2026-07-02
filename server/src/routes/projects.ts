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
import {
  attachProjectRole,
  enforceProjectMembership,
  guardProjectAction,
  requireAdmin,
  requireRole,
  userCanAccessProject,
} from '../middleware/auth.js'
import { listProjectIdsForUser } from '../auth/projectRoles.js'
import { parseProjectAction } from '../validation/schemas.js'
import { ActionValidationError } from '@pc/engine/actionValidation.js'
import { computeProjectEvm, computeProjectForecast } from '../services/computeService.js'
import { param } from '../utils/params.js'
import { publicErrorMessage, sendRouteError } from '../utils/routeError.js'

export const projectsRouter = Router()

projectsRouter.get('/', requireRole('viewer'), async (req, res) => {
  let projects = await listProjects()
  const user = req.user!
  if (user.role !== 'admin' && enforceProjectMembership()) {
    const allowed = new Set(await listProjectIdsForUser(user.id))
    projects = projects.filter((project) => allowed.has(project.id))
  }
  res.json({ projects })
})

projectsRouter.get('/active', requireRole('viewer'), async (req, res) => {
  try {
    const record = await getActiveProjectRecord()
    const user = req.user!
    if (!(await userCanAccessProject(user, record.state.meta.id))) {
      res.status(403).json({ error: 'You do not have access to the active project' })
      return
    }
    res.json({ state: record.state, version: record.version })
  } catch (error) {
    sendRouteError(res, error, 404, 'Active project not found')
  }
})

projectsRouter.use('/:projectId', attachProjectRole)

projectsRouter.get('/:projectId', requireRole('viewer'), async (req, res) => {
  try {
    const projectId = param(req.params.projectId)
    const record = await getProjectRecord(projectId)
    res.json({ state: record.state, version: record.version })
  } catch (error) {
    sendRouteError(res, error, 404, 'Project not found')
  }
})

projectsRouter.post('/:projectId/activate', requireRole('cost_controller'), async (req, res) => {
  try {
    const record = await setActiveProject(param(req.params.projectId))
    res.json({ state: record.state, version: record.version })
  } catch (error) {
    sendRouteError(res, error, 404, 'Project not found')
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

    // Optimistic concurrency is mandatory: without If-Match a write silently
    // overwrites whatever version is current (blind last-writer-wins).
    const rawIfMatch = req.headers['if-match']?.toString().trim()
    if (!rawIfMatch) {
      res.status(428).json({ error: 'If-Match header (current state version) is required' })
      return
    }
    const expectedVersion = Number(rawIfMatch)
    if (!Number.isInteger(expectedVersion) || expectedVersion < 1) {
      // Previously `Number('abc')` produced NaN, which failed the version
      // equality check and returned an unrecoverable 409 on every retry.
      res.status(400).json({ error: 'If-Match must be a positive integer state version' })
      return
    }

    const result = await applyAction(param(req.params.projectId), action, req.user ?? undefined, expectedVersion)
    res.setHeader('X-State-Version', String(result.version))
    res.json({ state: result.state, version: result.version })
  } catch (error) {
    if (error instanceof VersionConflictError) {
      res.status(409).json({
        error: publicErrorMessage(error, 'Version conflict — refresh and retry'),
        version: error.currentVersion,
      })
      return
    }
    if (error instanceof ActionValidationError) {
      res.status(400).json({ error: error.message })
      return
    }
    sendRouteError(res, error, 400, 'Action failed')
  }
})

projectsRouter.post('/:projectId/reset', requireAdmin, async (req, res) => {
  try {
    const record = await resetProject(param(req.params.projectId))
    res.json({ state: record.state, version: record.version })
  } catch (error) {
    sendRouteError(res, error, 404, 'Reset failed')
  }
})

export const computeRouter = Router({ mergeParams: true })

computeRouter.use(attachProjectRole)

computeRouter.get('/forecast', requireRole('viewer'), async (req, res) => {
  try {
    const projectId = param((req.params as { projectId?: string }).projectId)
    const state = await getProjectById(projectId)
    const { snapshots, totals } = computeProjectForecast(state)
    res.json({ totals, rows: snapshots.length })
  } catch (error) {
    sendRouteError(res, error, 404, 'Compute failed')
  }
})

computeRouter.get('/evm', requireRole('viewer'), async (req, res) => {
  try {
    const projectId = param((req.params as { projectId?: string }).projectId)
    const state = await getProjectById(projectId)
    res.json(computeProjectEvm(state))
  } catch (error) {
    sendRouteError(res, error, 404, 'Compute failed')
  }
})

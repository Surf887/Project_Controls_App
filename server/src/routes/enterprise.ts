import { Router } from 'express'
import { getActiveProject, getProjectById } from '../db/database.js'
import { attachProjectRole, requireRole } from '../middleware/auth.js'
import { listImmutableAuditAsync, verifyAuditChainAsync } from '../services/auditService.js'
import {
  createBaselineSnapshot,
  getBaselineSnapshot,
  listBaselineSnapshots,
  lockBaselineSnapshot,
} from '../services/baselineService.js'
import { generateClosePack } from '../services/exportService.js'
import { generateClosePackPdfAsync } from '../services/pdfExport.js'
import { param } from '../utils/params.js'
import { sendRouteError } from '../utils/routeError.js'
import { createBaselineSchema } from '../validation/schemas.js'

export const enterpriseRouter = Router({ mergeParams: true })

enterpriseRouter.use(attachProjectRole)

enterpriseRouter.get('/audit', requireRole('viewer'), async (req, res) => {
  try {
    const projectId = param(req.params.projectId)
    const [events, integrity] = await Promise.all([
      listImmutableAuditAsync(projectId),
      verifyAuditChainAsync(projectId),
    ])
    res.json({ events, integrity })
  } catch (error) {
    sendRouteError(res, error, 500, 'Audit read failed')
  }
})

enterpriseRouter.get('/baselines', requireRole('viewer'), async (req, res) => {
  try {
    res.json({ snapshots: await listBaselineSnapshots(param(req.params.projectId)) })
  } catch (error) {
    sendRouteError(res, error, 500, 'Baseline list failed')
  }
})

enterpriseRouter.get('/baselines/:snapshotId', requireRole('viewer'), async (req, res) => {
  try {
    const snapshot = await getBaselineSnapshot(param(req.params.projectId), param(req.params.snapshotId))
    if (!snapshot) {
      res.status(404).json({ error: 'Baseline snapshot not found' })
      return
    }
    res.json({ snapshot })
  } catch (error) {
    sendRouteError(res, error, 500, 'Baseline read failed')
  }
})

enterpriseRouter.post('/baselines', requireRole('approver'), async (req, res) => {
  try {
    const parsed = createBaselineSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid baseline payload', issues: parsed.error.flatten() })
      return
    }
    const projectId = param(req.params.projectId)
    const state = await getProjectById(projectId)
    const snapshot = await createBaselineSnapshot({
      projectId,
      label: parsed.data.label ?? `Baseline ${new Date().toISOString().slice(0, 10)}`,
      createdBy: req.user?.name ?? 'System',
      createdById: req.user?.id ?? 'system',
      costSheetRows: state.costSheetRows,
      wbsNodes: state.wbsNodes,
      basisOfEstimate: state.basisOfEstimate,
      notes: parsed.data.notes,
      status: 'sanctioned',
    })
    res.status(201).json({ snapshot })
  } catch (error) {
    sendRouteError(res, error, 400, 'Baseline create failed')
  }
})

enterpriseRouter.post('/baselines/:snapshotId/lock', requireRole('admin'), async (req, res) => {
  try {
    const snapshot = await lockBaselineSnapshot(param(req.params.projectId), param(req.params.snapshotId))
    if (!snapshot) {
      res.status(404).json({ error: 'Baseline snapshot not found' })
      return
    }
    res.json({ snapshot })
  } catch (error) {
    sendRouteError(res, error, 400, 'Baseline lock failed')
  }
})

enterpriseRouter.get('/exports/close-pack', requireRole('viewer'), async (req, res) => {
  try {
    const state = await getProjectById(param(req.params.projectId))
    const pack = generateClosePack(state, req.user?.name ?? 'System')
    res.json(pack)
  } catch (error) {
    sendRouteError(res, error, 500, 'Export failed')
  }
})

enterpriseRouter.get('/exports/close-pack.pdf', requireRole('viewer'), async (req, res) => {
  try {
    const projectId = param(req.params.projectId)
    const state = await getProjectById(projectId)
    const pdf = await generateClosePackPdfAsync(state, req.user?.name ?? 'System')
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="close-pack-${projectId}.pdf"`)
    res.send(pdf)
  } catch (error) {
    sendRouteError(res, error, 500, 'PDF export failed')
  }
})

enterpriseRouter.get('/portfolio/rollup', requireRole('viewer'), async (_req, res) => {
  try {
    await getActiveProject()
    res.json({ note: 'Use /api/platform/portfolio/governance for PMO rollup' })
  } catch (error) {
    sendRouteError(res, error, 500, 'Portfolio rollup failed')
  }
})

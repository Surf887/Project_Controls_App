import { Router } from 'express'
import { getActiveProject, getProjectById } from '../db/database.js'
import { attachProjectRole, requireRole } from '../middleware/auth.js'
import { listImmutableAudit, verifyAuditChain } from '../services/auditService.js'
import {
  createBaselineSnapshot,
  getBaselineSnapshot,
  listBaselineSnapshots,
  lockBaselineSnapshot,
} from '../services/baselineService.js'
import { generateClosePack } from '../services/exportService.js'
import { generateClosePackPdfAsync } from '../services/pdfExport.js'
import { param } from '../utils/params.js'

export const enterpriseRouter = Router({ mergeParams: true })

// Mounted separately from projectsRouter on /api/projects/:projectId, so it must
// run the project-role/membership guard itself (otherwise audit/baselines/exports
// would enforce only the global role — an IDOR across projects).
enterpriseRouter.use(attachProjectRole)

enterpriseRouter.get('/audit', requireRole('viewer'), (req, res) => {
  try {
    const projectId = param(req.params.projectId)
    const events = listImmutableAudit(projectId)
    const integrity = verifyAuditChain(projectId)
    res.json({ events, integrity })
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Audit read failed' })
  }
})

enterpriseRouter.get('/baselines', requireRole('viewer'), (req, res) => {
  try {
    res.json({ snapshots: listBaselineSnapshots(param(req.params.projectId)) })
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Baseline list failed' })
  }
})

enterpriseRouter.get('/baselines/:snapshotId', requireRole('viewer'), (req, res) => {
  try {
    const snapshot = getBaselineSnapshot(param(req.params.projectId), param(req.params.snapshotId))
    if (!snapshot) {
      res.status(404).json({ error: 'Baseline snapshot not found' })
      return
    }
    res.json({ snapshot })
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Baseline read failed' })
  }
})

enterpriseRouter.post('/baselines', requireRole('approver'), async (req, res) => {
  try {
    const projectId = param(req.params.projectId)
    const state = await getProjectById(projectId)
    const body = req.body as { label?: string; notes?: string }
    const snapshot = createBaselineSnapshot({
      projectId,
      label: body.label ?? `Baseline ${new Date().toISOString().slice(0, 10)}`,
      createdBy: req.user?.name ?? 'System',
      createdById: req.user?.id ?? 'system',
      costSheetRows: state.costSheetRows,
      wbsNodes: state.wbsNodes,
      basisOfEstimate: state.basisOfEstimate,
      notes: body.notes,
      status: 'sanctioned',
    })
    res.status(201).json({ snapshot })
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Baseline create failed' })
  }
})

enterpriseRouter.post('/baselines/:snapshotId/lock', requireRole('admin'), (req, res) => {
  try {
    const snapshot = lockBaselineSnapshot(param(req.params.projectId), param(req.params.snapshotId))
    if (!snapshot) {
      res.status(404).json({ error: 'Baseline snapshot not found' })
      return
    }
    res.json({ snapshot })
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Baseline lock failed' })
  }
})

enterpriseRouter.get('/exports/close-pack', requireRole('viewer'), async (req, res) => {
  try {
    const state = await getProjectById(param(req.params.projectId))
    const pack = generateClosePack(state, req.user?.name ?? 'System')
    res.json(pack)
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Export failed' })
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
    res.status(500).json({ error: error instanceof Error ? error.message : 'PDF export failed' })
  }
})

enterpriseRouter.get('/portfolio/rollup', requireRole('viewer'), async (_req, res) => {
  try {
    await getActiveProject()
    res.json({ note: 'Use /api/platform/portfolio/governance for PMO rollup' })
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Portfolio rollup failed' })
  }
})

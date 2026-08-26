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
import { createBaselineSchema, planviewStageSchema, snowflakeStageSchema } from '../validation/schemas.js'
import multer from 'multer'
import path from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import type { OcrProviderId, SourceDocument } from '@pc/data/documentIntelligence.js'
import { extractDocument, ocrProviderCapabilities } from '../services/ocrService.js'
import { extractDraftForecastDrivers } from '../services/documentDriverService.js'
import {
  createSourceDocument,
  findDocumentByHash,
  listSourceDocuments,
  updateSourceDocument,
} from '../services/documentStore.js'
import { scanDocument, validateDocumentSignature } from '../services/documentSecurity.js'
import { querySnowflakeDataset, snowflakeConfigured } from '../services/snowflakeService.js'
import { buildCostTransactionBatch } from '@pc/engine/costTransactionStaging.js'
import { planviewConfigured, queryPlanviewDataset } from '../services/planviewService.js'
import { buildPlanviewBatch } from '@pc/engine/planviewStaging.js'
import {
  enqueueIngestionJob,
  getIngestionJob,
  listIngestionJobs,
} from '../services/ingestionJobService.js'

export const enterpriseRouter = Router({ mergeParams: true })
const documentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 10 },
})

function safeFileName(value: string): string {
  return path.basename(value).replace(/[^a-zA-Z0-9._ -]/g, '_').slice(0, 240) || 'document'
}

function publicDocument(document: SourceDocument): SourceDocument {
  if (!document.extraction) return document
  return {
    ...document,
    extraction: {
      ...document.extraction,
      pages: document.extraction.pages.slice(0, 20).map((page) => ({
        ...page,
        text: page.text.slice(0, 5_000),
      })),
      fullText: document.extraction.fullText.slice(0, 100_000),
    },
  }
}

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

enterpriseRouter.get('/documents/providers', requireRole('viewer'), (_req, res) => {
  res.json({ providers: ocrProviderCapabilities() })
})

enterpriseRouter.get('/ingestion-jobs', requireRole('viewer'), async (req, res) => {
  try {
    res.json({ jobs: await listIngestionJobs(param(req.params.projectId)) })
  } catch (error) {
    sendRouteError(res, error, 500, 'Ingestion job list failed')
  }
})

enterpriseRouter.get('/ingestion-jobs/:jobId', requireRole('viewer'), async (req, res) => {
  try {
    const job = await getIngestionJob(
      param(req.params.projectId),
      param(req.params.jobId),
    )
    if (!job) {
      res.status(404).json({ error: 'Ingestion job not found' })
      return
    }
    res.json({ job })
  } catch (error) {
    sendRouteError(res, error, 500, 'Ingestion job read failed')
  }
})

enterpriseRouter.get('/snowflake/status', requireRole('viewer'), (_req, res) => {
  res.json({
    configured: snowflakeConfigured(),
    authentication: process.env.SNOWFLAKE_OAUTH_TOKEN
      ? 'oauth'
      : process.env.SNOWFLAKE_PRIVATE_KEY
        ? 'key_pair'
        : process.env.SNOWFLAKE_PASSWORD
          ? 'password'
          : 'none',
  })
})

enterpriseRouter.post('/snowflake/stage', requireRole('cost_controller'), async (req, res) => {
  const parsed = snowflakeStageSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid Snowflake staging request', issues: parsed.error.flatten() })
    return
  }
  try {
    const projectId = param(req.params.projectId)
    const state = await getProjectById(projectId)
    const profile = state.mappingProfiles.find((entry) => entry.id === parsed.data.profileId)
    if (
      !profile ||
      profile.status !== 'active' ||
      profile.sourceType !== 'snowflake' ||
      profile.targetDomain !== 'cost_transaction'
    ) {
      res.status(400).json({ error: 'Active Snowflake cost-transaction mapping profile not found' })
      return
    }
    const source = await querySnowflakeDataset({
      dataset: profile.dataset,
      limit: parsed.data.limit,
      watermarkColumn: parsed.data.watermarkColumn,
      afterWatermark: parsed.data.afterWatermark,
    })
    const watermarkKey = parsed.data.watermarkColumn?.toLowerCase().replace(/[^a-z0-9]/g, '')
    const watermark = watermarkKey
      ? source.rows.map((row) => row[watermarkKey]).filter(Boolean).sort().at(-1)
      : undefined
    const result = buildCostTransactionBatch(
      {
        profile,
        headers: source.headers,
        rows: source.rows,
        existingTransactions: state.costTransactions,
        importedBy: req.user?.name ?? 'Snowflake data steward',
        watermark,
      },
      state.costSheetRows,
    )
    res.json(result)
  } catch (error) {
    sendRouteError(res, error, 502, 'Snowflake staging failed')
  }
})

enterpriseRouter.get('/planview/status', requireRole('viewer'), (_req, res) => {
  res.json({
    configured: planviewConfigured(),
    product: process.env.PLANVIEW_PRODUCT ?? 'generic',
    authentication: process.env.PLANVIEW_OAUTH_TOKEN
      ? 'oauth_token'
      : process.env.PLANVIEW_CLIENT_ID
        ? 'oauth_client_credentials'
        : process.env.PLANVIEW_API_KEY
          ? 'api_key'
          : 'none',
  })
})

enterpriseRouter.post('/planview/stage', requireRole('cost_controller'), async (req, res) => {
  const parsed = planviewStageSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid Planview staging request', issues: parsed.error.flatten() })
    return
  }
  try {
    const projectId = param(req.params.projectId)
    const state = await getProjectById(projectId)
    const profile = state.mappingProfiles.find((entry) => entry.id === parsed.data.profileId)
    if (
      !profile ||
      profile.status !== 'active' ||
      profile.sourceType !== 'api' ||
      profile.targetDomain !== 'project_governance'
    ) {
      res.status(400).json({ error: 'Active Planview project-governance mapping profile not found' })
      return
    }
    const source = await queryPlanviewDataset(profile.dataset, {
      limit: parsed.data.limit,
      cursor: parsed.data.cursor,
    })
    const result = buildPlanviewBatch(
      profile,
      source.headers,
      source.rows,
      state.planviewItems,
      state,
      req.user?.name ?? 'Planview data steward',
      { cursor: source.nextCursor },
    )
    res.json(result)
  } catch (error) {
    sendRouteError(res, error, 502, 'Planview staging failed')
  }
})

enterpriseRouter.get('/documents', requireRole('viewer'), async (req, res) => {
  try {
    const documents = await listSourceDocuments(param(req.params.projectId))
    res.json({ documents: documents.map(publicDocument) })
  } catch (error) {
    sendRouteError(res, error, 500, 'Document list failed')
  }
})

enterpriseRouter.post(
  '/documents/ingest',
  requireRole('cost_controller'),
  documentUpload.single('file'),
  async (req, res) => {
    const file = req.file
    if (!file) {
      res.status(400).json({ error: 'Document file is required' })
      return
    }
    const provider = (req.body.provider ?? process.env.OCR_DEFAULT_PROVIDER ?? 'local') as OcrProviderId
    const capability = ocrProviderCapabilities().find((entry) => entry.id === provider)
    if (!capability?.configured) {
      res.status(400).json({ error: `OCR provider ${provider} is not configured` })
      return
    }
    if (!capability.supportedMimeTypes.includes(file.mimetype)) {
      res.status(415).json({ error: `${provider} does not support ${file.mimetype}` })
      return
    }

    const projectId = param(req.params.projectId)
    const fileName = safeFileName(file.originalname)
    const sha256 = createHash('sha256').update(file.buffer).digest('hex')
    try {
      validateDocumentSignature(file.buffer, file.mimetype)
      await scanDocument(file.buffer, file.mimetype, fileName)
      const duplicate = await findDocumentByHash(projectId, sha256)
      if (duplicate) {
        if (process.env.INGESTION_ASYNC === 'true' && duplicate.status === 'extracting') {
          const job = await enqueueIngestionJob({
            projectId,
            jobType: 'ocr_document',
            request: { documentId: duplicate.id },
            idempotencyKey: duplicate.sha256,
            createdById: req.user!.id,
            createdByName: req.user!.name,
            createdByRole: req.user!.role,
          })
          res.status(202).json({
            document: publicDocument(duplicate),
            drivers: [],
            duplicate: true,
            job,
          })
          return
        }
        res.json({ document: publicDocument(duplicate), drivers: duplicate.draftDrivers, duplicate: true })
        return
      }

      const uploadedAt = new Date().toISOString()
      const document: SourceDocument = {
        id: `DOC-${randomUUID()}`,
        projectId,
        fileName,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        sha256,
        provider,
        status: 'extracting',
        uploadedAt,
        uploadedBy: req.user?.name ?? 'Document reviewer',
        draftDrivers: [],
      }
      await createSourceDocument(document, file.buffer)

      if (process.env.INGESTION_ASYNC === 'true') {
        const job = await enqueueIngestionJob({
          projectId,
          jobType: 'ocr_document',
          request: { documentId: document.id },
          idempotencyKey: document.sha256,
          createdById: req.user!.id,
          createdByName: req.user!.name,
          createdByRole: req.user!.role,
        })
        res.status(202).json({
          document: publicDocument(document),
          drivers: [],
          duplicate: false,
          job,
        })
        return
      }

      try {
        const extraction = await extractDocument(provider, file.buffer, file.mimetype)
        const state = await getProjectById(projectId)
        const drivers = extractDraftForecastDrivers(document, extraction, state)
        const completed: SourceDocument = {
          ...document,
          status: 'review_required',
          extraction,
          draftDrivers: drivers,
        }
        await updateSourceDocument(completed)
        res.status(201).json({ document: publicDocument(completed), drivers, duplicate: false })
      } catch (extractionError) {
        const failed: SourceDocument = {
          ...document,
          status: 'failed',
          error: extractionError instanceof Error ? extractionError.message : 'Document extraction failed',
        }
        await updateSourceDocument(failed)
        res.status(422).json({ document: publicDocument(failed), drivers: [], error: failed.error })
      }
    } catch (error) {
      sendRouteError(res, error, 400, 'Document ingestion failed')
    }
  },
)

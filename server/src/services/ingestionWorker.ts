import { randomUUID } from 'node:crypto'
import type { SourceDocument } from '@pc/data/documentIntelligence.js'
import type { IngestionJob } from '@pc/data/ingestionJobs.js'
import type { Role } from '../auth/roles.js'
import { applyAction, getProjectById } from '../db/database.js'
import { logger } from '../utils/logger.js'
import { extractDraftForecastDrivers } from './documentDriverService.js'
import { getSourceDocumentContent, listSourceDocuments, updateSourceDocument } from './documentStore.js'
import { extractDocument } from './ocrService.js'
import {
  claimIngestionJob,
  completeIngestionJob,
  failIngestionJob,
} from './ingestionJobService.js'

const roles: Role[] = ['viewer', 'cost_controller', 'approver', 'admin']

function role(value: string): Role {
  return roles.includes(value as Role) ? (value as Role) : 'cost_controller'
}

function projectDocument(document: SourceDocument): SourceDocument {
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

async function processOcrDocument(job: IngestionJob): Promise<Record<string, unknown>> {
  const documentId = String(job.request.documentId ?? '')
  const document = (await listSourceDocuments(job.projectId)).find((entry) => entry.id === documentId)
  if (!document) throw new Error(`Source document not found: ${documentId}`)
  const content = await getSourceDocumentContent(job.projectId, document.id)
  if (!content) throw new Error(`Source document content not found: ${documentId}`)
  const extraction = await extractDocument(document.provider, content, document.mimeType)
  const state = await getProjectById(job.projectId)
  const drivers = extractDraftForecastDrivers(document, extraction, state)
  const completed: SourceDocument = {
    ...document,
    status: 'review_required',
    extraction,
    draftDrivers: drivers,
    error: undefined,
  }
  await updateSourceDocument(completed)
  await applyAction(
    job.projectId,
    {
      type: 'IMPORT_DOCUMENT_DRAFTS',
      payload: { document: projectDocument(completed), drivers },
    },
    {
      id: job.createdById,
      name: job.createdByName,
      role: role(job.createdByRole),
    },
  )
  return { documentId: document.id, driverCount: drivers.length }
}

async function markOcrFailed(job: IngestionJob, error: string): Promise<void> {
  if (job.jobType !== 'ocr_document' || job.attempts < job.maxAttempts) return
  const documentId = String(job.request.documentId ?? '')
  const document = (await listSourceDocuments(job.projectId)).find((entry) => entry.id === documentId)
  if (document) {
    await updateSourceDocument({ ...document, status: 'failed', error })
  }
}

export async function processNextIngestionJob(workerId: string): Promise<boolean> {
  const job = await claimIngestionJob(workerId)
  if (!job) return false
  try {
    let result: Record<string, unknown>
    switch (job.jobType) {
      case 'ocr_document':
        result = await processOcrDocument(job)
        break
      default:
        throw new Error(`No worker registered for ${job.jobType}`)
    }
    await completeIngestionJob(job.id, workerId, result)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Ingestion job failed'
    await markOcrFailed(job, message)
    await failIngestionJob(job, workerId, message)
    logger.error('ingestion_job_failed', {
      jobId: job.id,
      jobType: job.jobType,
      attempt: job.attempts,
      error: message,
    })
  }
  return true
}

export function startIngestionWorker(): () => void {
  const workerId = `worker-${process.pid}-${randomUUID()}`
  const intervalMs = Math.max(250, Number(process.env.INGESTION_WORKER_INTERVAL_MS ?? 1_000))
  let active = false
  const run = async () => {
    if (active) return
    active = true
    try {
      while (await processNextIngestionJob(workerId)) {
        // Drain available jobs before sleeping.
      }
    } finally {
      active = false
    }
  }
  void run()
  const timer = setInterval(() => void run(), intervalMs)
  return () => clearInterval(timer)
}

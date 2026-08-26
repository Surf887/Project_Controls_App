import { beforeEach, describe, expect, it } from 'vitest'
import {
  claimIngestionJob,
  clearMemoryJobsForTest,
  completeIngestionJob,
  enqueueIngestionJob,
  failIngestionJob,
  getIngestionJob,
} from './ingestionJobService.js'

beforeEach(() => clearMemoryJobsForTest())

describe('ingestion job queue', () => {
  const input = {
    projectId: 'proj-test',
    jobType: 'ocr_document' as const,
    request: { documentId: 'DOC-1' },
    idempotencyKey: 'hash-1',
    createdById: 'u-1',
    createdByName: 'Uploader',
    createdByRole: 'cost_controller',
    maxAttempts: 2,
  }

  it('enqueues idempotently and completes under the active lease', async () => {
    const first = await enqueueIngestionJob(input)
    const duplicate = await enqueueIngestionJob(input)
    expect(duplicate.id).toBe(first.id)

    const claimed = await claimIngestionJob('worker-1')
    expect(claimed?.status).toBe('running')
    expect(claimed?.attempts).toBe(1)
    await completeIngestionJob(first.id, 'worker-1', { driverCount: 2 })
    expect((await getIngestionJob(input.projectId, first.id))?.status).toBe('completed')
  })

  it('retries with backoff then becomes terminal', async () => {
    const queued = await enqueueIngestionJob(input)
    const first = (await claimIngestionJob('worker-1'))!
    await failIngestionJob(first, 'worker-1', 'temporary')
    const waiting = await getIngestionJob(input.projectId, queued.id)
    expect(waiting?.status).toBe('queued')
  })
})

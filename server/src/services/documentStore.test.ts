import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { SourceDocument } from '@pc/data/documentIntelligence.js'
import {
  createSourceDocument,
  findDocumentByHash,
  getSourceDocumentContent,
  listSourceDocuments,
} from './documentStore.js'

const originalDir = process.env.DOCUMENT_STORAGE_DIR
const originalKey = process.env.DOCUMENT_ENCRYPTION_KEY

afterEach(() => {
  if (originalDir == null) delete process.env.DOCUMENT_STORAGE_DIR
  else process.env.DOCUMENT_STORAGE_DIR = originalDir
  if (originalKey == null) delete process.env.DOCUMENT_ENCRYPTION_KEY
  else process.env.DOCUMENT_ENCRYPTION_KEY = originalKey
})

describe('documentStore file fallback', () => {
  it('persists encrypted bytes and returns metadata only', async () => {
    process.env.DOCUMENT_STORAGE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-docs-'))
    process.env.DOCUMENT_ENCRYPTION_KEY = 'document-store-test-key'
    const document: SourceDocument = {
      id: 'DOC-test',
      projectId: 'proj-test',
      fileName: 'forecast.txt',
      mimeType: 'text/plain',
      sizeBytes: 20,
      sha256: 'a'.repeat(64),
      provider: 'local',
      status: 'uploaded',
      uploadedAt: '2026-08-21T00:00:00.000Z',
      uploadedBy: 'Tester',
      draftDrivers: [],
    }
    const content = Buffer.from('USD 1m forecast risk')
    await createSourceDocument(document, content)

    expect((await listSourceDocuments(document.projectId))[0]?.id).toBe(document.id)
    expect((await findDocumentByHash(document.projectId, document.sha256))?.id).toBe(document.id)
    expect((await getSourceDocumentContent(document.projectId, document.id))?.equals(content)).toBe(true)
  })
})

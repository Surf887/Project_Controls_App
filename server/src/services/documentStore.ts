import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { SourceDocument } from '@pc/data/documentIntelligence.js'
import { getPool, isPostgresEnabled, query } from '../db/postgres.js'
import { assertSafeId, resolveUnderRoot } from '../utils/safePath.js'
import { decryptDocument, encryptDocument } from './documentCrypto.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function root(): string {
  return process.env.DOCUMENT_STORAGE_DIR ?? path.resolve(__dirname, '../../data/documents')
}

function projectDir(projectId: string): string {
  return resolveUnderRoot(root(), assertSafeId(projectId, 'projectId'))
}

function contentPath(projectId: string, id: string): string {
  return resolveUnderRoot(projectDir(projectId), `${assertSafeId(id, 'documentId')}.bin`)
}

function metadataPath(projectId: string, id: string): string {
  return resolveUnderRoot(projectDir(projectId), `${assertSafeId(id, 'documentId')}.json`)
}

interface DocumentRow {
  id: string
  project_id: string
  file_name: string
  mime_type: string
  size_bytes: number
  sha256: string
  provider: SourceDocument['provider']
  status: SourceDocument['status']
  extraction_encrypted: Buffer | null
  draft_drivers: SourceDocument['draftDrivers']
  uploaded_by: string
  uploaded_at: Date | string
  error: string | null
}

function fromRow(row: DocumentRow): SourceDocument {
  const extraction = row.extraction_encrypted
    ? (JSON.parse(decryptDocument(row.extraction_encrypted).toString('utf8')) as SourceDocument['extraction'])
    : undefined
  return {
    id: row.id,
    projectId: row.project_id,
    fileName: row.file_name,
    mimeType: row.mime_type,
    sizeBytes: Number(row.size_bytes),
    sha256: row.sha256,
    provider: row.provider,
    status: row.status,
    uploadedAt: row.uploaded_at instanceof Date ? row.uploaded_at.toISOString() : new Date(row.uploaded_at).toISOString(),
    uploadedBy: row.uploaded_by,
    extraction,
    draftDrivers: row.draft_drivers ?? [],
    error: row.error ?? undefined,
  }
}

const selectDocument = `
  SELECT id, project_id, file_name, mime_type, size_bytes, sha256, provider, status,
         extraction_encrypted, draft_drivers, uploaded_by, uploaded_at, error
  FROM source_documents
`
const listDocument = `
  SELECT id, project_id, file_name, mime_type, size_bytes, sha256, provider, status,
         NULL::bytea AS extraction_encrypted, draft_drivers, uploaded_by, uploaded_at, error
  FROM source_documents
`

export async function findDocumentByHash(projectId: string, sha256: string): Promise<SourceDocument | null> {
  if (isPostgresEnabled()) {
    const result = await query<DocumentRow>(
      `${selectDocument} WHERE project_id = $1 AND sha256 = $2`,
      [assertSafeId(projectId, 'projectId'), sha256],
    )
    return result.rows[0] ? fromRow(result.rows[0]) : null
  }
  const dir = projectDir(projectId)
  if (!fs.existsSync(dir)) return null
  for (const name of fs.readdirSync(dir).filter((entry) => entry.endsWith('.json'))) {
    const document = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8')) as SourceDocument
    if (document.sha256 === sha256) return document
  }
  return null
}

export async function createSourceDocument(document: SourceDocument, content: Buffer): Promise<void> {
  if (isPostgresEnabled()) {
    await query(
      `INSERT INTO source_documents
        (id, project_id, file_name, mime_type, size_bytes, sha256, provider, status,
         encrypted_content, extraction_encrypted, draft_drivers, uploaded_by, uploaded_at, error)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13,$14)`,
      [
        document.id,
        document.projectId,
        document.fileName,
        document.mimeType,
        document.sizeBytes,
        document.sha256,
        document.provider,
        document.status,
        encryptDocument(content),
        document.extraction ? encryptDocument(Buffer.from(JSON.stringify(document.extraction))) : null,
        JSON.stringify(document.draftDrivers),
        document.uploadedBy,
        document.uploadedAt,
        document.error ?? null,
      ],
    )
    return
  }
  fs.mkdirSync(projectDir(document.projectId), { recursive: true })
  fs.writeFileSync(contentPath(document.projectId, document.id), encryptDocument(content))
  fs.writeFileSync(metadataPath(document.projectId, document.id), JSON.stringify(document, null, 2))
}

export async function updateSourceDocument(document: SourceDocument): Promise<void> {
  if (isPostgresEnabled()) {
    await query(
      `UPDATE source_documents
       SET provider = $3, status = $4, extraction_encrypted = $5, draft_drivers = $6::jsonb, error = $7
       WHERE project_id = $1 AND id = $2`,
      [
        document.projectId,
        document.id,
        document.provider,
        document.status,
        document.extraction ? encryptDocument(Buffer.from(JSON.stringify(document.extraction))) : null,
        JSON.stringify(document.draftDrivers),
        document.error ?? null,
      ],
    )
    return
  }
  fs.writeFileSync(metadataPath(document.projectId, document.id), JSON.stringify(document, null, 2))
}

export async function listSourceDocuments(projectId: string): Promise<SourceDocument[]> {
  if (isPostgresEnabled()) {
    const result = await query<DocumentRow>(
      `${listDocument} WHERE project_id = $1 ORDER BY uploaded_at DESC LIMIT 200`,
      [assertSafeId(projectId, 'projectId')],
    )
    return result.rows.map(fromRow)
  }
  const dir = projectDir(projectId)
  if (!fs.existsSync(dir)) return []
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .map((name) => JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8')) as SourceDocument)
    .sort((left, right) => right.uploadedAt.localeCompare(left.uploadedAt))
}

export async function getSourceDocumentContent(projectId: string, id: string): Promise<Buffer | null> {
  if (isPostgresEnabled()) {
    const client = await getPool().query<{ encrypted_content: Buffer }>(
      'SELECT encrypted_content FROM source_documents WHERE project_id = $1 AND id = $2',
      [assertSafeId(projectId, 'projectId'), assertSafeId(id, 'documentId')],
    )
    return client.rows[0] ? decryptDocument(client.rows[0].encrypted_content) : null
  }
  const file = contentPath(projectId, id)
  return fs.existsSync(file) ? decryptDocument(fs.readFileSync(file)) : null
}

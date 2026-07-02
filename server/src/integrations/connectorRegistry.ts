import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { isPostgresEnabled, query } from '../db/postgres.js'
import { encryptConnectorTokens, decryptConnectorTokens } from './connectorCrypto.js'

export type IntegrationDomain = 'erp' | 'schedule' | 'contracts' | 'procurement' | 'document_control'

export interface SyncJobRequest {
  connectorId: string
  domain: IntegrationDomain
  direction: 'inbound' | 'outbound'
  projectId?: string
  payload?: Record<string, unknown>
}

export interface SyncJobResult {
  jobId: string
  connectorId: string
  domain: IntegrationDomain
  status: 'queued' | 'running' | 'completed' | 'failed'
  startedAt: string
  completedAt?: string
  recordsProcessed: number
  recordsSkipped: number
  validationWarnings: string[]
  errors: string[]
}

export interface IntegrationAdapter {
  id: string
  name: string
  domain: IntegrationDomain
  vendor: string
  configured: boolean
  sync: (request: SyncJobRequest) => Promise<SyncJobResult>
}

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const credsPath = path.resolve(__dirname, '../../data/connector_credentials.json')

async function isConfigured(connectorId: string): Promise<boolean> {
  if (isPostgresEnabled()) {
    const result = await query<{ configured: boolean }>(
      'SELECT configured FROM connector_credentials WHERE connector_id = $1',
      [connectorId],
    )
    return result.rows[0]?.configured ?? false
  }
  if (!fs.existsSync(credsPath)) return false
  const rows = JSON.parse(fs.readFileSync(credsPath, 'utf8')) as Record<string, { configured: boolean }>
  return rows[connectorId]?.configured ?? false
}

export async function saveConnectorOAuth(connectorId: string, tokens: Record<string, string>): Promise<void> {
  if (isPostgresEnabled()) {
    // Encrypt at rest: store the AES-256-GCM envelope as a JSON string in the
    // jsonb column (mirrors the file store). Never persist raw OAuth tokens.
    await query(
      `INSERT INTO connector_credentials (connector_id, oauth_tokens, configured, updated_at)
       VALUES ($1, $2::jsonb, TRUE, NOW())
       ON CONFLICT (connector_id) DO UPDATE SET oauth_tokens = EXCLUDED.oauth_tokens, configured = TRUE, updated_at = NOW()`,
      [connectorId, JSON.stringify(encryptConnectorTokens(tokens))],
    )
    return
  }
  const rows = fs.existsSync(credsPath)
    ? (JSON.parse(fs.readFileSync(credsPath, 'utf8')) as Record<string, { oauth_tokens_enc?: string; oauth_tokens?: Record<string, string>; configured: boolean; updated_at?: string }>)
    : {}
  rows[connectorId] = {
    oauth_tokens_enc: encryptConnectorTokens(tokens),
    configured: true,
    updated_at: new Date().toISOString(),
  }
  fs.mkdirSync(path.dirname(credsPath), { recursive: true })
  fs.writeFileSync(credsPath, JSON.stringify(rows, null, 2), 'utf8')
}

export async function getConnectorOAuth(connectorId: string): Promise<Record<string, string> | null> {
  if (isPostgresEnabled()) {
    const result = await query<{ oauth_tokens: unknown }>(
      'SELECT oauth_tokens FROM connector_credentials WHERE connector_id = $1',
      [connectorId],
    )
    const stored = result.rows[0]?.oauth_tokens
    if (stored == null) return null
    // New rows store the encrypted envelope as a JSON string; legacy rows
    // stored the plaintext token object directly. Handle both.
    if (typeof stored === 'string') {
      return decryptConnectorTokens(stored)
    }
    return stored as Record<string, string>
  }
  if (!fs.existsSync(credsPath)) return null
  const rows = JSON.parse(fs.readFileSync(credsPath, 'utf8')) as Record<
    string,
    { oauth_tokens_enc?: string; oauth_tokens?: Record<string, string> }
  >
  const entry = rows[connectorId]
  if (!entry) return null
  if (entry.oauth_tokens_enc) {
    return decryptConnectorTokens(entry.oauth_tokens_enc)
  }
  return entry.oauth_tokens ?? null
}

/** Validate partial ERP load — reject silent overwrite of unmatched WBS. */
export function validatePartialLoad(rows: Array<{ wbs: string; amount: number }>, knownWbs: Set<string>) {
  const warnings: string[] = []
  const errors: string[] = []
  let processed = 0
  let skipped = 0

  rows.forEach((row) => {
    if (!knownWbs.has(row.wbs)) {
      skipped++
      warnings.push(`Unmatched WBS ${row.wbs} — skipped (no silent overwrite)`)
      return
    }
    if (row.amount < 0) {
      errors.push(`Invalid amount for ${row.wbs}`)
      return
    }
    processed++
  })

  return { processed, skipped, warnings, errors, ok: errors.length === 0 }
}

function sapSync(request: SyncJobRequest): Promise<SyncJobResult> {
  const sampleRows = [
    { wbs: 'A.01', amount: 1200000 },
    { wbs: 'A.01.01', amount: 500000 },
    { wbs: 'UNKNOWN-WBS', amount: 999 },
  ]
  const known = new Set(['A.01', 'A.01.01', 'A.02', 'P.04'])
  const validation = validatePartialLoad(sampleRows, known)

  return Promise.resolve({
    jobId: `JOB-${Date.now()}`,
    connectorId: request.connectorId,
    domain: request.domain,
    status: validation.ok ? 'completed' : 'failed',
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    recordsProcessed: validation.processed,
    recordsSkipped: validation.skipped,
    validationWarnings: validation.warnings,
    errors: validation.errors,
  })
}

function createAdapter(
  id: string,
  name: string,
  domain: IntegrationDomain,
  vendor: string,
  syncFn?: (request: SyncJobRequest) => Promise<SyncJobResult>,
): IntegrationAdapter {
  return {
    id,
    name,
    domain,
    vendor,
    configured: false,
    sync: syncFn ?? (async (request) => ({
      jobId: `JOB-${Date.now()}`,
      connectorId: request.connectorId,
      domain: request.domain,
      status: 'failed',
      startedAt: new Date().toISOString(),
      recordsProcessed: 0,
      recordsSkipped: 0,
      validationWarnings: [],
      errors: [`${vendor} adapter not configured — POST /api/platform/integrations/oauth/${id}`],
    })),
  }
}

export const integrationAdapters: IntegrationAdapter[] = [
  { ...createAdapter('sap-s4', 'SAP S/4HANA', 'erp', 'SAP', sapSync), sync: sapSync },
  createAdapter('oracle-erp', 'Oracle ERP Cloud', 'erp', 'Oracle'),
  createAdapter('p6-cloud', 'Primavera P6', 'schedule', 'Oracle'),
  createAdapter('aconex', 'Aconex', 'document_control', 'Oracle'),
  createAdapter('sharepoint', 'SharePoint', 'document_control', 'Microsoft'),
  createAdapter('unifier', 'Oracle Unifier', 'contracts', 'Oracle'),
  createAdapter('coupa', 'Coupa Procurement', 'procurement', 'Coupa'),
]

export function getAdapter(id: string): IntegrationAdapter | undefined {
  return integrationAdapters.find((adapter) => adapter.id === id)
}

export async function runSyncJob(request: SyncJobRequest): Promise<SyncJobResult> {
  const adapter = getAdapter(request.connectorId)
  if (!adapter) {
    return {
      jobId: `JOB-${Date.now()}`,
      connectorId: request.connectorId,
      domain: request.domain,
      status: 'failed',
      startedAt: new Date().toISOString(),
      recordsProcessed: 0,
      recordsSkipped: 0,
      validationWarnings: [],
      errors: [`Unknown connector: ${request.connectorId}`],
    }
  }

  const configured = await isConfigured(request.connectorId)
  if (!configured && request.connectorId !== 'sap-s4') {
    return adapter.sync(request)
  }

  return adapter.sync(request)
}

export function listAdaptersByDomain(domain?: IntegrationDomain): IntegrationAdapter[] {
  const list = domain ? integrationAdapters.filter((a) => a.domain === domain) : integrationAdapters
  return list
}

export async function handleWebhook(
  connectorId: string,
  payload: unknown,
): Promise<{ ok: boolean; deliveryId: string; message: string }> {
  const deliveryId = randomUUID()
  const body = JSON.stringify(payload)

  if (isPostgresEnabled()) {
    await query(
      `INSERT INTO webhook_deliveries (id, connector_id, payload, status) VALUES ($1, $2, $3::jsonb, 'received')`,
      [deliveryId, connectorId, body],
    )
  }

  if (connectorId === 'sap-s4' && typeof payload === 'object' && payload !== null && 'rows' in payload) {
    const rows = (payload as { rows: Array<{ wbs: string; amount: number }> }).rows
    const validation = validatePartialLoad(rows, new Set(['A.01', 'A.02']))
    return {
      ok: validation.ok,
      deliveryId,
      message: validation.ok
        ? `Processed ${validation.processed} rows, skipped ${validation.skipped}`
        : validation.errors.join('; '),
    }
  }

  return { ok: true, deliveryId, message: 'Webhook received' }
}

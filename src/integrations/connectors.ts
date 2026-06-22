import type { ProjectState } from '../store/types'

export type ConnectorType = 'sharepoint' | 'aconex' | 'snowflake' | 'sap_hana'
export type SyncTarget = 'wbs' | 'changes' | 'cost_sheet' | 'reports'
export type AuthMethod = 'oauth2' | 'api_key' | 'connection_string'

export interface ConnectorConfig {
  id: string
  type: ConnectorType
  name: string
  enabled: boolean
  endpoint: string
  tenantId: string
  clientId: string
  authMethod: AuthMethod
  syncTargets: SyncTarget[]
  lastSyncAt?: string
  lastSyncStatus?: 'success' | 'failed' | 'never'
  lastSyncMessage?: string
}

export interface SyncJobResult {
  id: string
  connectorId: string
  startedAt: string
  completedAt: string
  status: 'success' | 'failed'
  recordsImported: number
  message: string
  targets: SyncTarget[]
}

export const connectorLabels: Record<ConnectorType, string> = {
  sharepoint: 'Microsoft SharePoint (Graph API)',
  aconex: 'Oracle Aconex',
  snowflake: 'Snowflake on Azure',
  sap_hana: 'SAP HANA / OData',
}

export const defaultConnectors: ConnectorConfig[] = [
  {
    id: 'conn-sharepoint',
    type: 'sharepoint',
    name: 'SharePoint — Project Controls Library',
    enabled: false,
    endpoint: 'https://graph.microsoft.com/v1.0/sites/{site-id}/drives/{drive-id}',
    tenantId: '',
    clientId: '',
    authMethod: 'oauth2',
    syncTargets: ['reports', 'changes'],
    lastSyncStatus: 'never',
    lastSyncMessage: 'Not configured',
  },
  {
    id: 'conn-aconex',
    type: 'aconex',
    name: 'Aconex — Mail & Document Export',
    enabled: false,
    endpoint: 'https://api.aconex.com/api/project/{project-id}',
    tenantId: '',
    clientId: '',
    authMethod: 'oauth2',
    syncTargets: ['reports', 'changes'],
    lastSyncStatus: 'never',
    lastSyncMessage: 'Not configured',
  },
  {
    id: 'conn-snowflake',
    type: 'snowflake',
    name: 'Snowflake — Azure Cost Warehouse',
    enabled: false,
    endpoint: 'https://{account}.azure.snowflakecomputing.com/api/v2/statements',
    tenantId: '',
    clientId: '',
    authMethod: 'connection_string',
    syncTargets: ['cost_sheet', 'wbs'],
    lastSyncStatus: 'never',
    lastSyncMessage: 'Not configured',
  },
  {
    id: 'conn-sap',
    type: 'sap_hana',
    name: 'SAP HANA — Commitments & Actuals',
    enabled: false,
    endpoint: 'https://{host}:443/sap/opu/odata/sap/API_JOURNALENTRY_SRV',
    tenantId: '',
    clientId: '',
    authMethod: 'api_key',
    syncTargets: ['cost_sheet', 'changes'],
    lastSyncStatus: 'never',
    lastSyncMessage: 'Not configured',
  },
]

export function validateConnector(config: ConnectorConfig): string | null {
  if (!config.endpoint.trim()) {
    return 'Endpoint URL is required.'
  }

  if (config.authMethod === 'oauth2' && (!config.tenantId.trim() || !config.clientId.trim())) {
    return 'OAuth connectors require tenant ID and client ID.'
  }

  if (config.syncTargets.length === 0) {
    return 'Select at least one sync target.'
  }

  return null
}

export async function testConnectorConnection(config: ConnectorConfig): Promise<{ ok: boolean; message: string }> {
  const validationError = validateConnector(config)
  if (validationError) {
    return { ok: false, message: validationError }
  }

  await delay(600)

  if (!config.enabled) {
    return { ok: false, message: 'Enable the connector before testing.' }
  }

  return {
    ok: true,
    message: `${connectorLabels[config.type]} endpoint validated (simulated handshake). Ready for sync.`,
  }
}

export async function runConnectorSync(
  config: ConnectorConfig,
  state: ProjectState,
): Promise<{ job: SyncJobResult; patch: Partial<ProjectState> }> {
  const validationError = validateConnector(config)
  if (validationError) {
    throw new Error(validationError)
  }

  if (!config.enabled) {
    throw new Error('Connector is disabled.')
  }

  await delay(900)

  const startedAt = new Date().toISOString()
  const recordsImported = 4 + config.syncTargets.length * 2
  const patch: Partial<ProjectState> = {}

  if (config.syncTargets.includes('reports')) {
    patch.reports = [
      {
        id: `rpt-sync-${Date.now()}`,
        name: `${config.name} export.csv`,
        contractor: 'Synced source',
        packageName: 'Integration import',
        period: '2026-W24',
        sourceType: 'excel',
        receivedAt: new Date().toLocaleString(),
        status: 'received',
        confidence: 0.88,
        extractedCount: 12,
        issueCount: 0,
        sourceSystem: connectorLabels[config.type],
      },
      ...state.reports,
    ]
  }

  if (config.syncTargets.includes('changes')) {
    patch.changes = state.changes
  }

  const job: SyncJobResult = {
    id: `sync-${Date.now()}`,
    connectorId: config.id,
    startedAt,
    completedAt: new Date().toISOString(),
    status: 'success',
    recordsImported,
    message: `Imported ${recordsImported} records from ${connectorLabels[config.type]} (${config.syncTargets.join(', ')}).`,
    targets: config.syncTargets,
  }

  return { job, patch }
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

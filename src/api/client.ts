import type { ProjectAction, ProjectState } from '../store/types'
import type { OcrProviderCapability, OcrProviderId, SourceDocument } from '../data/documentIntelligence'
import type { ForecastDriver } from '../data/forecastDrivers'
import type { CostTransaction, CostTransactionBatch } from '../data/costTransactions'
import type { PlanviewGovernanceItem, PlanviewSyncBatch } from '../data/planview'

const API_BASE = import.meta.env.VITE_API_BASE ?? '/api'
let sessionToken: string | null = null

export interface ProjectSummary {
  id: string
  name: string
  baselineLabel: string
  updatedAt: string
}

export interface AuthUser {
  id: string
  name: string
  role: string
  email?: string
}

export interface AuthSession {
  token: string
  user: AuthUser
  expiresIn?: number
}

export interface AuthConfig {
  demoAuthEnabled: boolean
  oidcEnabled: boolean
}

export interface ImmutableAuditEvent {
  seq: number
  id: string
  projectId: string
  at: string
  actor: string
  actorId: string
  team: string
  entityType: string
  entityId: string
  action: string
  summary: string
  prevHash: string
  hash: string
}

/** Error carrying the HTTP status so callers can branch (e.g. 401 -> re-login). */
export class ApiError extends Error {
  status: number
  version?: number
  constructor(message: string, status: number, version?: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.version = version
  }
}

function persistSession(data: AuthSession) {
  sessionToken = data.token
  if (typeof localStorage !== 'undefined') {
    // The signed credential is retained in memory and in the server-issued
    // HttpOnly cookie, never in persistent browser storage.
    localStorage.removeItem('pc-token')
    localStorage.setItem('pc-role', data.user.role)
    localStorage.setItem('pc-user', JSON.stringify(data.user))
    // Persist an absolute expiry (ms epoch) derived from expiresIn (seconds) so
    // the client can proactively detect expiry. No backend refresh endpoint
    // exists, so detection is purely client-side.
    if (typeof data.expiresIn === 'number' && data.expiresIn > 0) {
      localStorage.setItem('pc-expires-at', String(Date.now() + data.expiresIn * 1000))
    } else {
      localStorage.removeItem('pc-expires-at')
    }
  }
}

export function hasToken(): boolean {
  return Boolean(sessionToken)
}

/** Absolute session expiry as ms-epoch, or null if unknown/not set. */
export function getSessionExpiry(): number | null {
  if (typeof localStorage === 'undefined') return null
  const raw = localStorage.getItem('pc-expires-at')
  if (!raw) return null
  const value = Number(raw)
  return Number.isFinite(value) ? value : null
}

/** True when we have an expiry timestamp and it is in the past. */
export function isSessionExpired(): boolean {
  const expiry = getSessionExpiry()
  return expiry !== null && Date.now() >= expiry
}

function authHeaders(): Record<string, string> {
  if (typeof localStorage === 'undefined') {
    return import.meta.env.VITE_DEMO_AUTH === 'true' ? { 'x-pc-role': 'cost_controller' } : {}
  }
  if (sessionToken) {
    return { Authorization: `Bearer ${sessionToken}` }
  }
  // x-pc-role is a local-demo convenience only; the server ignores it unless
  // DEMO_AUTH is enabled (never in production).
  if (import.meta.env.VITE_DEMO_AUTH === 'true') {
    const role = localStorage.getItem('pc-role')
    return { 'x-pc-role': role ?? 'cost_controller' }
  }
  return {}
}

/** Public: which login options the server supports. */
export async function getAuthConfig(): Promise<AuthConfig> {
  return request('/platform/auth/config')
}

/** Restore an authenticated browser session from the HttpOnly session cookie. */
export async function restoreSession(): Promise<AuthUser> {
  const data = await request<{ user: AuthUser }>('/platform/auth/me')
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('pc-user', JSON.stringify(data.user))
    localStorage.removeItem('pc-token')
  }
  return data.user
}

/** Real password login. */
export async function loginWithPassword(email: string, password: string): Promise<AuthSession> {
  const data = await request<AuthSession>('/platform/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
  persistSession(data)
  return data
}

/** Exchange a verified OIDC ID token (from your IdP) for a session. */
export async function loginWithOidc(idToken: string): Promise<AuthSession> {
  const data = await request<AuthSession>('/platform/auth/oidc', {
    method: 'POST',
    body: JSON.stringify({ idToken }),
  })
  persistSession(data)
  return data
}

/** Demo-only sign-in by role. Only works when the server has DEMO_AUTH enabled. */
export async function signIn(role: string): Promise<AuthSession> {
  const data = await request<AuthSession>('/platform/auth/token', {
    method: 'POST',
    body: JSON.stringify({ role }),
  })
  persistSession(data)
  return data
}

export function getStoredUser(): AuthUser | null {
  if (typeof localStorage === 'undefined') return null
  const raw = localStorage.getItem('pc-user')
  return raw ? (JSON.parse(raw) as AuthUser) : null
}

export function clearAuthSession() {
  sessionToken = null
  void fetch(`${API_BASE}/platform/auth/logout`, {
    method: 'POST',
    credentials: 'include',
  }).catch(() => undefined)
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem('pc-token')
    localStorage.removeItem('pc-role')
    localStorage.removeItem('pc-user')
    localStorage.removeItem('pc-expires-at')
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers)
  headers.set('Accept', 'application/json')
  for (const [name, value] of Object.entries(authHeaders())) {
    headers.set(name, value)
  }
  if (init?.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
    credentials: 'include',
  })

  if (response.status === 409) {
    const body = (await response.json()) as { error: string; version?: number }
    throw new ApiError(body.error || 'Version conflict — refresh and retry', 409, body.version)
  }

  if (!response.ok) {
    const body = await response.text()
    let message = body
    try {
      const parsed = JSON.parse(body) as { error?: string }
      if (parsed?.error) message = parsed.error
    } catch {
      /* body was not JSON — use raw text */
    }
    throw new ApiError(message || `Request failed (${response.status})`, response.status)
  }

  if (response.status === 204) {
    return undefined as T
  }

  return response.json() as Promise<T>
}

export async function checkHealth(): Promise<{ ok: boolean; version: string; postgres?: boolean; service?: string }> {
  return request('/health')
}

export async function downloadClosePackPdf(projectId: string): Promise<Blob> {
  const response = await fetch(`${API_BASE}/projects/${encodeURIComponent(projectId)}/exports/close-pack.pdf`, {
    headers: authHeaders(),
    credentials: 'include',
  })
  if (!response.ok) {
    throw new Error('PDF download failed')
  }
  return response.blob()
}

export async function listProjects(): Promise<ProjectSummary[]> {
  const data = await request<{ projects: ProjectSummary[] }>('/projects')
  return data.projects
}

export interface ProjectResponse {
  state: ProjectState
  version: number
}

let stateVersion = 1

export function getClientStateVersion(): number {
  return stateVersion
}

export async function getProject(projectId?: string): Promise<ProjectState> {
  const path = projectId ? `/projects/${encodeURIComponent(projectId)}` : '/projects/active'
  const data = await request<ProjectResponse>(path)
  stateVersion = data.version ?? 1
  return data.state
}

export async function dispatchAction(projectId: string, action: ProjectAction): Promise<ProjectState> {
  const data = await request<ProjectResponse>(`/projects/${encodeURIComponent(projectId)}/actions`, {
    method: 'POST',
    headers: { 'If-Match': String(stateVersion) },
    body: JSON.stringify(action),
  })
  stateVersion = data.version ?? stateVersion + 1
  return data.state
}

export async function activateProject(projectId: string): Promise<ProjectState> {
  const data = await request<ProjectResponse>(`/projects/${encodeURIComponent(projectId)}/activate`, {
    method: 'POST',
  })
  stateVersion = data.version ?? 1
  return data.state
}

export async function resetProject(projectId: string): Promise<ProjectState> {
  const data = await request<ProjectResponse>(`/projects/${encodeURIComponent(projectId)}/reset`, {
    method: 'POST',
  })
  stateVersion = data.version ?? 1
  return data.state
}

export interface ForecastTotals {
  eacBase: number
  eacBestCase: number
  eacMostLikely: number
  eacWorstCase: number
  approvedChangesDelta: number
  pendingChangesExpectedDelta: number
  riskExposure: number
  controlLogExposure: number
  contingencyDraw: number
  fxExposure: number
}

/** Shape returned by GET /projects/:id/compute/forecast ({ totals, rows }). */
export interface ForecastComputeResponse {
  totals: ForecastTotals
  /** Number of per-WBS snapshot rows the totals were aggregated from. */
  rows: number
}

export async function fetchForecastTotals(projectId: string): Promise<ForecastTotals> {
  // Server returns an envelope `{ totals, rows }` where `totals` is the
  // rolled-up forecast snapshot. Unwrap totals for callers that only want the
  // aggregated forecast figures.
  const data = await request<ForecastComputeResponse>(
    `/projects/${encodeURIComponent(projectId)}/compute/forecast`,
  )
  return data.totals
}

export async function fetchEvmSummary(projectId: string) {
  return request(`/projects/${encodeURIComponent(projectId)}/compute/evm`)
}

export async function fetchImmutableAudit(projectId: string): Promise<{
  events: ImmutableAuditEvent[]
  integrity: { ok: boolean; errors: string[] }
}> {
  return request(`/projects/${encodeURIComponent(projectId)}/audit`)
}

export async function fetchOcrProviders(projectId: string): Promise<OcrProviderCapability[]> {
  const data = await request<{ providers: OcrProviderCapability[] }>(
    `/projects/${encodeURIComponent(projectId)}/documents/providers`,
  )
  return data.providers
}

export async function fetchSourceDocuments(projectId: string): Promise<SourceDocument[]> {
  const data = await request<{ documents: SourceDocument[] }>(
    `/projects/${encodeURIComponent(projectId)}/documents`,
  )
  return data.documents
}

export async function ingestSourceDocument(
  projectId: string,
  file: File,
  provider: OcrProviderId,
): Promise<{ document: SourceDocument; drivers: ForecastDriver[]; duplicate: boolean }> {
  const form = new FormData()
  form.set('provider', provider)
  form.set('file', file)
  return request(`/projects/${encodeURIComponent(projectId)}/documents/ingest`, {
    method: 'POST',
    body: form,
  })
}

export async function fetchSnowflakeStatus(projectId: string): Promise<{
  configured: boolean
  authentication: 'oauth' | 'key_pair' | 'password' | 'none'
}> {
  return request(`/projects/${encodeURIComponent(projectId)}/snowflake/status`)
}

export async function stageSnowflakeTransactions(
  projectId: string,
  input: {
    profileId: string
    limit?: number
    watermarkColumn?: string
    afterWatermark?: string
  },
): Promise<{ batch: CostTransactionBatch; transactions: CostTransaction[] }> {
  return request(`/projects/${encodeURIComponent(projectId)}/snowflake/stage`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export async function fetchPlanviewStatus(projectId: string): Promise<{
  configured: boolean
  product: string
  authentication: string
}> {
  return request(`/projects/${encodeURIComponent(projectId)}/planview/status`)
}

export async function stagePlanviewItems(
  projectId: string,
  input: { profileId: string; limit?: number; cursor?: string },
): Promise<{ batch: PlanviewSyncBatch; items: PlanviewGovernanceItem[] }> {
  return request(`/projects/${encodeURIComponent(projectId)}/planview/stage`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export interface ClosePackFile {
  name: string
  mimeType: string
  content: string
}

export interface ClosePackBundle {
  projectId: string
  projectName: string
  generatedAt: string
  files: ClosePackFile[]
}

export async function fetchClosePack(projectId: string): Promise<ClosePackBundle> {
  return request(`/projects/${encodeURIComponent(projectId)}/exports/close-pack`)
}

export function closePackPdfUrl(projectId: string): string {
  return `${API_BASE}/projects/${encodeURIComponent(projectId)}/exports/close-pack.pdf`
}

export interface SavedFilterRecord {
  id: string
  userId: string
  scope: string
  name: string
  payload: Record<string, string>
  shared: boolean
  createdAt: string
}

export async function fetchSavedFilters(scope?: string): Promise<SavedFilterRecord[]> {
  const query = scope ? `?scope=${encodeURIComponent(scope)}` : ''
  const data = await request<{ filters: SavedFilterRecord[] }>(`/platform/filters${query}`)
  return data.filters
}

export async function saveSavedFilter(input: {
  name: string
  scope: string
  payload: Record<string, string>
  shared?: boolean
}): Promise<SavedFilterRecord> {
  const data = await request<{ filter: SavedFilterRecord }>('/platform/filters', {
    method: 'POST',
    body: JSON.stringify(input),
  })
  return data.filter
}

export async function deleteSavedFilter(filterId: string): Promise<void> {
  await request(`/platform/filters/${encodeURIComponent(filterId)}`, { method: 'DELETE' })
}

export interface PortfolioGovernanceResponse {
  policy: {
    id: string
    name: string
    cpiWarningThreshold: number
    openChangeExposureLimitUsd: number
    forecastSignoffRoles: string[]
  }
  rollup: {
    portfolioId: string
    name: string
    projectCount: number
    totalBacUsd: number
    totalEacUsd: number
    totalActualsUsd: number
    weightedCpi: number
    weightedSpi: number
    flaggedProjects: Array<{ id: string; name: string; reason: string }>
  }
}

export async function fetchPortfolioGovernance(): Promise<PortfolioGovernanceResponse> {
  return request('/platform/portfolio/governance')
}

export interface WorkflowDefinition {
  id: string
  name: string
  entityType: string
  description: string
  statuses: string[]
  transitions: Array<{ from: string; to: string; minRole: string }>
}

export async function fetchWorkflows(): Promise<WorkflowDefinition[]> {
  const data = await request<{ workflows: WorkflowDefinition[] }>('/platform/workflows')
  return data.workflows
}

export interface WorkflowDelegation {
  id: string
  workflowId: string
  projectId?: string
  fromUserId: string
  toUserId: string
  until: string
  createdAt: string
}

export async function fetchWorkflowDelegations(): Promise<WorkflowDelegation[]> {
  const data = await request<{ delegations: WorkflowDelegation[] }>('/platform/workflows/delegations')
  return data.delegations
}

export async function createWorkflowDelegation(input: {
  workflowId: string
  projectId?: string
  fromUserId: string
  toUserId: string
  until: string
}): Promise<WorkflowDelegation> {
  const data = await request<{ delegation: WorkflowDelegation }>('/platform/workflows/delegations', {
    method: 'POST',
    body: JSON.stringify(input),
  })
  return data.delegation
}

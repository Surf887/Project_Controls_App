export interface PlanviewQueryResult {
  headers: string[]
  rows: Record<string, string>[]
  nextCursor?: string
}

export function planviewConfigured(): boolean {
  return Boolean(
    process.env.PLANVIEW_BASE_URL &&
      (process.env.PLANVIEW_OAUTH_TOKEN ||
        (process.env.PLANVIEW_CLIENT_ID &&
          process.env.PLANVIEW_CLIENT_SECRET &&
          process.env.PLANVIEW_TOKEN_URL) ||
        process.env.PLANVIEW_API_KEY),
  )
}

function safeEndpoint(value: string): string {
  if (!value || value.includes('..') || /^https?:\/\//i.test(value) || !/^[A-Za-z0-9_/?=&%$(),.' -]+$/.test(value)) {
    throw new Error('Invalid Planview endpoint path')
  }
  return value.replace(/^\/+/, '')
}

async function accessToken(): Promise<string | null> {
  if (process.env.PLANVIEW_OAUTH_TOKEN) return process.env.PLANVIEW_OAUTH_TOKEN
  if (!process.env.PLANVIEW_CLIENT_ID || !process.env.PLANVIEW_CLIENT_SECRET || !process.env.PLANVIEW_TOKEN_URL) {
    return null
  }
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: process.env.PLANVIEW_CLIENT_ID,
    client_secret: process.env.PLANVIEW_CLIENT_SECRET,
  })
  const response = await fetch(process.env.PLANVIEW_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body,
    signal: AbortSignal.timeout(30_000),
  })
  if (!response.ok) throw new Error(`Planview OAuth token request failed (${response.status})`)
  const result = (await response.json()) as { access_token?: string }
  if (!result.access_token) throw new Error('Planview OAuth response omitted access_token')
  return result.access_token
}

function flatten(value: unknown, prefix = '', output: Record<string, string> = {}): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return output
  Object.entries(value as Record<string, unknown>).forEach(([key, entry]) => {
    const target = prefix ? `${prefix}.${key}` : key
    if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
      flatten(entry, target, output)
    } else {
      output[target.toLowerCase().replace(/[^a-z0-9]/g, '')] =
        entry == null ? '' : entry instanceof Date ? entry.toISOString() : typeof entry === 'object' ? JSON.stringify(entry) : String(entry)
    }
  })
  return output
}

function selectRows(payload: unknown): { rows: unknown[]; cursor?: string } {
  if (Array.isArray(payload)) return { rows: payload }
  if (!payload || typeof payload !== 'object') return { rows: [] }
  const record = payload as Record<string, unknown>
  const candidates = [
    process.env.PLANVIEW_DATA_PATH,
    'Data',
    'data',
    'items',
    'results',
    'entities',
  ].filter(Boolean) as string[]
  const rows = candidates.map((key) => record[key]).find(Array.isArray) as unknown[] | undefined
  const paging = record.paging as { hasMore?: boolean; from?: number; limit?: number } | undefined
  const cursor =
    paging?.hasMore && paging.from != null && paging.limit != null
      ? String(paging.from + paging.limit)
      : typeof record.next === 'string'
        ? record.next
        : undefined
  return { rows: rows ?? [], cursor }
}

export function normalizePlanviewPayload(payload: unknown): PlanviewQueryResult {
  const selected = selectRows(payload)
  const records = selected.rows.filter(
    (row): row is Record<string, unknown> => Boolean(row && typeof row === 'object'),
  )
  const rows = records.map((row) => flatten(row))
  return {
    headers: [...new Set(rows.flatMap((row) => Object.keys(row)))],
    rows,
    nextCursor: selected.cursor,
  }
}

export async function queryPlanviewDataset(
  endpoint: string,
  options?: { limit?: number; cursor?: string },
): Promise<PlanviewQueryResult> {
  if (!planviewConfigured()) throw new Error('Planview connection is not configured')
  const base = process.env.PLANVIEW_BASE_URL!.replace(/\/+$/, '')
  const path = safeEndpoint(endpoint)
  const url = new URL(`${base}/${path}`)
  const limit = Math.min(Math.max(Math.trunc(options?.limit ?? 500), 1), 1_000)
  const product = process.env.PLANVIEW_PRODUCT ?? 'generic'
  url.searchParams.set(product === 'projectplace' ? 'count' : 'limit', String(limit))
  if (options?.cursor) {
    url.searchParams.set(product === 'projectplace' ? 'offset' : 'from', options.cursor)
  }
  const token = await accessToken()
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(process.env.PLANVIEW_API_KEY ? { 'X-API-Key': process.env.PLANVIEW_API_KEY } : {}),
    },
    signal: AbortSignal.timeout(60_000),
  })
  if (!response.ok) throw new Error(`Planview query failed (${response.status})`)
  return normalizePlanviewPayload(await response.json())
}

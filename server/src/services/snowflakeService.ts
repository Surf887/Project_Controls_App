import snowflake from 'snowflake-sdk'

export interface SnowflakeQueryResult {
  headers: string[]
  rows: Record<string, string>[]
}

export interface SnowflakeQueryOptions {
  dataset: string
  limit?: number
  watermarkColumn?: string
  afterWatermark?: string
}

export function snowflakeConfigured(): boolean {
  return Boolean(
    process.env.SNOWFLAKE_ACCOUNT &&
      process.env.SNOWFLAKE_USERNAME &&
      process.env.SNOWFLAKE_WAREHOUSE &&
      process.env.SNOWFLAKE_DATABASE &&
      process.env.SNOWFLAKE_SCHEMA &&
      (process.env.SNOWFLAKE_OAUTH_TOKEN ||
        process.env.SNOWFLAKE_PRIVATE_KEY ||
        process.env.SNOWFLAKE_PASSWORD),
  )
}

function quotedIdentifier(value: string): string {
  const parts = value.split('.')
  if (
    parts.length < 1 ||
    parts.length > 3 ||
    parts.some((part) => !/^[A-Za-z_][A-Za-z0-9_$]*$/.test(part))
  ) {
    throw new Error(`Invalid Snowflake identifier: ${value}`)
  }
  return parts.map((part) => `"${part.replace(/"/g, '""')}"`).join('.')
}

function connectionOptions(): snowflake.ConnectionOptions {
  if (!snowflakeConfigured()) throw new Error('Snowflake connection is not configured')
  const base: snowflake.ConnectionOptions = {
    account: process.env.SNOWFLAKE_ACCOUNT!,
    username: process.env.SNOWFLAKE_USERNAME!,
    warehouse: process.env.SNOWFLAKE_WAREHOUSE!,
    database: process.env.SNOWFLAKE_DATABASE!,
    schema: process.env.SNOWFLAKE_SCHEMA!,
    role: process.env.SNOWFLAKE_ROLE,
    application: 'project-controls-intelligence',
  }
  if (process.env.SNOWFLAKE_OAUTH_TOKEN) {
    return { ...base, authenticator: 'OAUTH', token: process.env.SNOWFLAKE_OAUTH_TOKEN }
  }
  if (process.env.SNOWFLAKE_PRIVATE_KEY) {
    return {
      ...base,
      authenticator: 'SNOWFLAKE_JWT',
      privateKey: process.env.SNOWFLAKE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      privateKeyPass: process.env.SNOWFLAKE_PRIVATE_KEY_PASSPHRASE,
    }
  }
  if (process.env.NODE_ENV === 'production' && process.env.SNOWFLAKE_ALLOW_PASSWORD_AUTH !== 'true') {
    throw new Error('Snowflake password authentication is disabled in production; configure OAuth or key-pair auth')
  }
  return { ...base, password: process.env.SNOWFLAKE_PASSWORD }
}

function connect(): Promise<snowflake.Connection> {
  const connection = snowflake.createConnection(connectionOptions())
  return new Promise((resolve, reject) => {
    connection.connect((error) => (error ? reject(new Error(`Snowflake connection failed: ${error.message}`)) : resolve(connection)))
  })
}

function execute(
  connection: snowflake.Connection,
  sqlText: string,
  binds: snowflake.Binds,
): Promise<unknown[]> {
  return new Promise((resolve, reject) => {
    connection.execute({
      sqlText,
      binds,
      complete: (error, _statement, rows) =>
        error ? reject(new Error(`Snowflake query failed: ${error.message}`)) : resolve(rows ?? []),
    })
  })
}

function destroy(connection: snowflake.Connection): Promise<void> {
  return new Promise((resolve) => {
    connection.destroy(() => resolve())
  })
}

function stringify(value: unknown): string {
  if (value == null) return ''
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

export function normalizeSnowflakeRows(rows: unknown[]): SnowflakeQueryResult {
  const records = rows.filter((row): row is Record<string, unknown> => Boolean(row && typeof row === 'object'))
  const headers = [...new Set(records.flatMap((row) => Object.keys(row)))]
  return {
    headers,
    rows: records.map((row) =>
      Object.fromEntries(
        Object.entries(row).map(([key, value]) => [
          key.toLowerCase().replace(/[^a-z0-9]/g, ''),
          stringify(value),
        ]),
      ),
    ),
  }
}

export async function querySnowflakeDataset(options: SnowflakeQueryOptions): Promise<SnowflakeQueryResult> {
  const dataset = quotedIdentifier(options.dataset)
  const limit = Math.min(Math.max(Math.trunc(options.limit ?? 500), 1), 1_000)
  const binds: snowflake.Binds = []
  let where = ''
  let order = ''
  if (options.watermarkColumn && options.afterWatermark) {
    const watermark = quotedIdentifier(options.watermarkColumn)
    where = ` WHERE ${watermark} > ?`
    order = ` ORDER BY ${watermark} ASC`
    binds.push(options.afterWatermark)
  }
  const connection = await connect()
  try {
    const rows = await execute(
      connection,
      `SELECT * FROM ${dataset}${where}${order} LIMIT ${limit}`,
      binds,
    )
    return normalizeSnowflakeRows(rows)
  } finally {
    await destroy(connection)
  }
}

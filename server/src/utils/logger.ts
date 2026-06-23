/**
 * Tiny dependency-free structured logger. Each call prints a single JSON line to
 * stdout (info) or stderr (warn/error) with a timestamp, level, message and any
 * extra fields. Honors LOG_LEVEL (error > warn > info; default 'info'). Test runs
 * default to 'error' to keep output quiet unless LOG_LEVEL is set explicitly.
 *
 * Never pass request bodies, passwords or tokens as fields - log identifiers only.
 */

type Level = 'info' | 'warn' | 'error'

const LEVEL_WEIGHT: Record<Level, number> = { error: 0, warn: 1, info: 2 }

function thresholdWeight(): number {
  const configured = process.env.LOG_LEVEL?.toLowerCase()
  if (configured && configured in LEVEL_WEIGHT) {
    return LEVEL_WEIGHT[configured as Level]
  }
  // Quiet by default during tests so the suite output stays readable.
  if (process.env.NODE_ENV === 'test') return LEVEL_WEIGHT.error
  return LEVEL_WEIGHT.info
}

function emit(level: Level, msg: string, fields?: Record<string, unknown>): void {
  if (LEVEL_WEIGHT[level] > thresholdWeight()) return
  const line = JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    msg,
    ...(fields ?? {}),
  })
  if (level === 'error' || level === 'warn') {
    process.stderr.write(`${line}\n`)
  } else {
    process.stdout.write(`${line}\n`)
  }
}

export const logger = {
  info: (msg: string, fields?: Record<string, unknown>) => emit('info', msg, fields),
  warn: (msg: string, fields?: Record<string, unknown>) => emit('warn', msg, fields),
  error: (msg: string, fields?: Record<string, unknown>) => emit('error', msg, fields),
}

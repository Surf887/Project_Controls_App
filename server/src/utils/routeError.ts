import { randomUUID } from 'node:crypto'
import type { Response } from 'express'
import { logger } from './logger.js'

export function isProductionEnv(): boolean {
  return process.env.NODE_ENV === 'production'
}

/** Client-safe message — hides internals in production. */
export function publicErrorMessage(error: unknown, fallback: string): string {
  if (!isProductionEnv() && error instanceof Error && error.message) {
    return error.message
  }
  return fallback
}

export function sendRouteError(
  res: Response,
  error: unknown,
  status: number,
  fallback: string,
  extra?: Record<string, unknown>,
): void {
  const requestId = res.getHeader('x-request-id')
  const errorId = typeof requestId === 'string' ? requestId : randomUUID()
  logger.error('route_error', {
    requestId: errorId,
    status,
    error: error instanceof Error ? error.message : 'unknown',
  })
  res.status(status).json({ error: publicErrorMessage(error, fallback), errorId, ...extra })
}

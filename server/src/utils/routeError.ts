import { randomUUID } from 'node:crypto'
import type { Response } from 'express'

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
  const errorId = randomUUID()
  console.error(`[route-error ${errorId}]`, error)
  res.status(status).json({ error: publicErrorMessage(error, fallback), errorId, ...extra })
}

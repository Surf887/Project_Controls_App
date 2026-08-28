import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import { randomUUID, timingSafeEqual } from 'node:crypto'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { rateLimitDisabled, trustProxySetting } from './config/env.js'
import { computeRouter, projectsRouter } from './routes/projects.js'
import { enterpriseRouter } from './routes/enterprise.js'
import { platformRouter } from './routes/platform.js'
import { authRouter } from './routes/auth.js'
import { scimRouter } from './routes/scim.js'
import { attachUser } from './middleware/auth.js'
import { logger } from './utils/logger.js'
import { beginRequestMetric, renderPrometheusMetrics } from './utils/metrics.js'
import { pingRedis, redisRateLimitStore } from './services/redisService.js'

type RequestWithId = express.Request & { requestId?: string }

function requestIdFrom(req: express.Request): string {
  const supplied = req.header('x-request-id')
  return supplied && /^[a-zA-Z0-9._:-]{1,128}$/.test(supplied) ? supplied : randomUUID()
}

function validMetricsCredential(req: express.Request): boolean {
  const expected = process.env.METRICS_TOKEN
  if (!expected) return false
  const supplied = req.header('authorization')?.replace(/^Bearer\s+/i, '') ?? ''
  const left = Buffer.from(supplied)
  const right = Buffer.from(expected)
  return left.length === right.length && timingSafeEqual(left, right)
}

/**
 * CORS origins come from CORS_ORIGIN (comma-separated allowlist). In production
 * an explicit allowlist is required; without it we deny cross-origin requests
 * rather than reflecting any origin. In dev we reflect the request origin.
 */
function corsOptions(): cors.CorsOptions {
  const configured = process.env.CORS_ORIGIN?.split(',').map((o) => o.trim()).filter(Boolean)
  if (configured && configured.length > 0) {
    return { origin: configured, credentials: true }
  }
  if (process.env.NODE_ENV === 'production') {
    return { origin: false }
  }
  return { origin: true }
}

export function createApp() {
  const app = express()
  app.disable('x-powered-by')

  app.use((req, res, next) => {
    const requestId = requestIdFrom(req)
    const startedAt = Date.now()
    const finishMetric = beginRequestMetric(req.method, req.path)
    ;(req as RequestWithId).requestId = requestId
    res.setHeader('x-request-id', requestId)
    res.on('finish', () => {
      finishMetric(res.statusCode)
      logger.info('http_request', {
        requestId,
        method: req.method,
        path: req.path,
        status: res.statusCode,
        durationMs: Date.now() - startedAt,
      })
    })
    next()
  })

  const trustProxy = trustProxySetting()
  if (trustProxy != null) {
    app.set('trust proxy', trustProxy)
  }

  app.use(helmet())
  app.use(cors(corsOptions()))
  app.use(
    express.json({
      limit: process.env.JSON_LIMIT ?? '1mb',
      verify: (req, _res, buf) => {
        ;(req as unknown as { rawBody?: Buffer }).rawBody = buf
      },
    }),
  )

  app.use(
    rateLimit({
      windowMs: 60 * 1000,
      max: Number(process.env.RATE_LIMIT_PER_MIN ?? 300),
      standardHeaders: true,
      legacyHeaders: false,
      store: redisRateLimitStore('api'),
      skip: () => rateLimitDisabled(),
    }),
  )

  app.use(attachUser)

  app.get('/api/health/live', (_req, res) => {
    res.json({ ok: true, service: 'project-controls-api' })
  })

  app.get('/api/metrics', (req, res) => {
    if (!process.env.METRICS_TOKEN) {
      res.status(404).json({ error: 'Not found' })
      return
    }
    if (!validMetricsCredential(req)) {
      res.status(401).json({ error: 'Authentication required' })
      return
    }
    res.type('text/plain; version=0.0.4').send(renderPrometheusMetrics())
  })

  app.get('/api/health/ready', async (req, res) => {
    try {
      const { isUsingPostgres, pingDatabase } = await import('./db/database.js')
      if (isUsingPostgres()) {
        await pingDatabase()
      }
      await pingRedis()
      res.json({ ok: true, postgres: isUsingPostgres() })
    } catch (error) {
      logger.error('readiness_check_failed', {
        requestId: (req as RequestWithId).requestId,
        error: error instanceof Error ? error.message : 'unknown',
      })
      res.status(503).json({ ok: false, error: 'Not ready' })
    }
  })

  app.get('/api/health', async (_req, res) => {
    const { isUsingPostgres, pingDatabase } = await import('./db/database.js')
    try {
      if (isUsingPostgres()) {
        await pingDatabase()
      }
      await pingRedis()
      res.json({ ok: true, ready: true, version: '1.0.0', service: 'project-controls-api', postgres: isUsingPostgres() })
    } catch {
      res.status(503).json({ ok: false, ready: false, version: '1.0.0', service: 'project-controls-api', postgres: isUsingPostgres() })
    }
  })

  app.use('/api/platform/auth', authRouter)
  app.use('/api/scim/v2', scimRouter)
  app.use('/api/platform', platformRouter)
  app.use('/api/projects', projectsRouter)
  app.use('/api/projects/:projectId/compute', computeRouter)
  app.use('/api/projects/:projectId', enterpriseRouter)

  if (process.env.NODE_ENV === 'production' && process.env.SERVE_CLIENT !== 'false') {
    const clientDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../dist')
    if (fs.existsSync(clientDir)) {
      app.use(express.static(clientDir))
      app.get(/^(?!\/api\/).*/, (_req, res) => {
        res.sendFile(path.join(clientDir, 'index.html'))
      })
    }
  }

  app.use((_req, res) => {
    res.status(404).json({ error: 'Not found' })
  })

  app.use((error: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const errorId = (req as RequestWithId).requestId ?? randomUUID()
    const uploadCode =
      typeof error === 'object' && error !== null && 'code' in error
        ? String((error as { code?: unknown }).code)
        : ''
    if (uploadCode.startsWith('LIMIT_')) {
      res.status(uploadCode === 'LIMIT_FILE_SIZE' ? 413 : 400).json({
        error: uploadCode === 'LIMIT_FILE_SIZE' ? 'Document exceeds the 10 MB upload limit' : 'Invalid document upload',
        errorId,
      })
      return
    }
    logger.error('unhandled_request_error', {
      requestId: errorId,
      method: req.method,
      path: req.path,
      error: error instanceof Error ? error.message : 'unknown',
    })
    if (process.env.NODE_ENV === 'production') {
      res.status(500).json({ error: 'Internal server error', errorId })
      return
    }
    res.status(500).json({ error: error instanceof Error ? error.message : 'Internal server error', errorId })
  })

  return app
}

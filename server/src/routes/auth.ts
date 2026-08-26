import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { rateLimitDisabled } from '../config/env.js'
import { signSessionToken } from '../auth/jwt.js'
import { DEMO_USERS, isDemoAuthEnabled, type Role } from '../auth/rbac.js'
import { requireAdmin, requireRole } from '../middleware/auth.js'
import {
  createUser,
  findUserByEmail,
  listUsers,
  toPublicUser,
  verifyUserPassword,
} from '../auth/userStore.js'
import { isOidcEnabled, verifyOidcIdToken, findOrProvisionOidcUser, OidcAccountError } from '../auth/oidc.js'
import { loginSchema, oidcLoginSchema, registerUserSchema } from '../validation/schemas.js'
import type { Response } from 'express'
import { redisRateLimitStore } from '../services/redisService.js'
import {
  createOidcAuthorization,
  exchangeOidcCode,
  verifyOidcFlowCookie,
} from '../auth/oidcFlow.js'

export const authRouter = Router()

const SESSION_TTL_SEC = Number(process.env.SESSION_TTL_SEC ?? 3600)

export function setSessionCookie(res: Response, token: string) {
  res.cookie('pc_session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/api',
    maxAge: SESSION_TTL_SEC * 1000,
  })
}

function clearSessionCookie(res: Response) {
  res.clearCookie('pc_session', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/api',
  })
}

function cookieValue(cookieHeader: string | undefined, name: string): string | undefined {
  return cookieHeader
    ?.split(';')
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith(`${name}=`))
    ?.slice(name.length + 1)
}

/**
 * Public: lets the client decide which login options to present (password is
 * always available; SSO/demo only when configured). No secrets exposed.
 */
authRouter.get('/config', (_req, res) => {
  const oidcEnabled = isOidcEnabled() && Boolean(process.env.OIDC_REDIRECT_URI)
  res.json({
    demoAuthEnabled: isDemoAuthEnabled(),
    oidcEnabled,
    oidcLoginUrl: oidcEnabled ? '/api/platform/auth/oidc/start' : undefined,
  })
})

// Throttle credential-guessing. Generous enough for real users, tight enough to
// blunt brute force. Disabled under test to keep the suite deterministic.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  store: redisRateLimitStore('login'),
  skip: () => rateLimitDisabled(),
  message: { error: 'Too many login attempts — try again later' },
})

/** Password login. Returns a signed session token + the public user record. */
authRouter.post('/login', loginLimiter, async (req, res) => {
  const parsed = loginSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid login payload' })
    return
  }
  const user = await findUserByEmail(parsed.data.email)
  // Generic error + always run a compare to avoid user-enumeration / timing leaks.
  const ok = user && !user.disabled && (await verifyUserPassword(user, parsed.data.password))
  if (!user || !ok) {
    if (!user) await verifyUserPassword({ passwordHash: '$2a$12$0000000000000000000000000000000000000000000000000000' } as never, parsed.data.password).catch(() => false)
    res.status(401).json({ error: 'Invalid email or password' })
    return
  }
  const token = await signSessionToken(user, SESSION_TTL_SEC)
  setSessionCookie(res, token)
  res.json({ token, user: toPublicUser(user), expiresIn: SESSION_TTL_SEC })
})

authRouter.get('/oidc/start', loginLimiter, async (req, res) => {
  if (!isOidcEnabled() || !process.env.OIDC_REDIRECT_URI) {
    res.status(404).json({ error: 'OIDC Authorization Code flow is not configured' })
    return
  }
  const authorization = await createOidcAuthorization(req.query.returnTo?.toString())
  res.cookie('pc_oidc_flow', authorization.flowCookie, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/api/platform/auth/oidc',
    maxAge: 10 * 60 * 1000,
  })
  res.redirect(302, authorization.authorizationUrl)
})

authRouter.get('/oidc/callback', loginLimiter, async (req, res) => {
  const code = req.query.code?.toString()
  const state = req.query.state?.toString()
  const flowCookie = cookieValue(req.headers.cookie, 'pc_oidc_flow')
  res.clearCookie('pc_oidc_flow', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/api/platform/auth/oidc',
  })
  if (!code || !state || !flowCookie) {
    res.redirect(302, '/?sso_error=invalid_callback')
    return
  }
  try {
    const flow = await verifyOidcFlowCookie(flowCookie, state)
    const idToken = await exchangeOidcCode(code, flow.verifier)
    const profile = await verifyOidcIdToken(idToken, undefined, flow.nonce)
    if (!profile) throw new Error('OIDC token verification failed')
    const user = await findOrProvisionOidcUser(profile)
    if (user.disabled) throw new Error('Account disabled')
    const token = await signSessionToken(user, SESSION_TTL_SEC)
    setSessionCookie(res, token)
    const separator = flow.returnTo.includes('?') ? '&' : '?'
    res.redirect(302, `${flow.returnTo}${separator}sso=success`)
  } catch (error) {
    const message = error instanceof OidcAccountError ? 'account_link' : 'authentication'
    res.redirect(302, `/?sso_error=${message}`)
  }
})

/** Legacy ID-token exchange retained only for non-production migrations/tests. */
authRouter.post('/oidc', loginLimiter, async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    res.status(404).json({ error: 'Not found' })
    return
  }
  if (!isOidcEnabled()) {
    res.status(404).json({ error: 'OIDC is not configured' })
    return
  }
  const parsed = oidcLoginSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid payload' })
    return
  }
  const profile = await verifyOidcIdToken(parsed.data.idToken)
  if (!profile) {
    res.status(401).json({ error: 'OIDC token verification failed' })
    return
  }
  let user
  try {
    user = await findOrProvisionOidcUser(profile)
  } catch (error) {
    if (error instanceof OidcAccountError) {
      res.status(409).json({ error: error.message })
      return
    }
    throw error
  }
  if (user.disabled) {
    res.status(403).json({ error: 'Account disabled' })
    return
  }
  const token = await signSessionToken(user, SESSION_TTL_SEC)
  setSessionCookie(res, token)
  res.json({ token, user: toPublicUser(user), expiresIn: SESSION_TTL_SEC })
})

/** Admin-only user provisioning for local (password) accounts. */
authRouter.post('/register', requireAdmin, async (req, res) => {
  const parsed = registerUserSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid user payload', issues: parsed.error.flatten() })
    return
  }
  if (await findUserByEmail(parsed.data.email)) {
    res.status(409).json({ error: 'A user with that email already exists' })
    return
  }
  const user = await createUser({ ...parsed.data, provider: 'local' })
  res.status(201).json({ user: toPublicUser(user) })
})

authRouter.get('/me', requireRole('viewer'), (req, res) => {
  res.json({ user: req.user, globalRole: req.globalRole })
})

authRouter.post('/logout', (_req, res) => {
  clearSessionCookie(res)
  res.status(204).send()
})

authRouter.get('/users', requireAdmin, async (_req, res) => {
  res.json({ users: await listUsers() })
})

/**
 * Demo-only: mint a token for a chosen role with no credentials. Returns 404
 * unless DEMO_AUTH is explicitly enabled (and never in production).
 */
authRouter.post('/token', async (req, res) => {
  if (!isDemoAuthEnabled()) {
    res.status(404).json({ error: 'Not found' })
    return
  }
  const { userId, role } = req.body as { userId?: string; role?: Role }
  const user = DEMO_USERS.find((u) => u.id === userId || u.role === role) ?? DEMO_USERS[1]!
  const token = await signSessionToken(user, SESSION_TTL_SEC)
  setSessionCookie(res, token)
  res.json({ token, user, expiresIn: SESSION_TTL_SEC })
})

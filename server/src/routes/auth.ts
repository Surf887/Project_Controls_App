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

export const authRouter = Router()

const SESSION_TTL_SEC = Number(process.env.SESSION_TTL_SEC ?? 3600)

/**
 * Public: lets the client decide which login options to present (password is
 * always available; SSO/demo only when configured). No secrets exposed.
 */
authRouter.get('/config', (_req, res) => {
  res.json({ demoAuthEnabled: isDemoAuthEnabled(), oidcEnabled: isOidcEnabled() })
})

// Throttle credential-guessing. Generous enough for real users, tight enough to
// blunt brute force. Disabled under test to keep the suite deterministic.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
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
  res.json({ token, user: toPublicUser(user), expiresIn: SESSION_TTL_SEC })
})

/** Exchange a verified OIDC ID token for a local session token. */
authRouter.post('/oidc', loginLimiter, async (req, res) => {
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
  res.json({ token, user, expiresIn: SESSION_TTL_SEC })
})

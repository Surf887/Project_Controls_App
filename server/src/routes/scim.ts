import { Router, type RequestHandler, type Response } from 'express'
import { timingSafeEqual } from 'node:crypto'
import type { Role } from '../auth/roles.js'
import {
  createUser,
  findUserByEmail,
  findUserById,
  findUserByScimExternalId,
  listUserRecords,
  updateProvisionedUser,
  type UserRecord,
} from '../auth/userStore.js'
import { revokeUserSessions } from '../auth/sessionStore.js'
import { param } from '../utils/params.js'

export const scimRouter = Router()
const roles: Role[] = ['viewer', 'cost_controller', 'approver', 'admin']

const requireScimToken: RequestHandler = (req, res, next) => {
  const expected = process.env.SCIM_BEARER_TOKEN
  if (!expected) {
    res.status(404).json({ detail: 'Not found', status: '404' })
    return
  }
  const supplied = req.header('authorization')?.replace(/^Bearer\s+/i, '') ?? ''
  const left = Buffer.from(supplied)
  const right = Buffer.from(expected)
  if (left.length !== right.length || !timingSafeEqual(left, right)) {
    res.status(401).json({
      schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
      detail: 'Authentication required',
      status: '401',
    })
    return
  }
  next()
}

function scimUser(user: UserRecord) {
  return {
    schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
    id: user.id,
    externalId: user.scimExternalId ?? undefined,
    userName: user.email,
    displayName: user.name,
    name: { formatted: user.name },
    emails: [{ value: user.email, primary: true, type: 'work' }],
    active: !user.disabled,
    roles: [{ value: user.role, primary: true }],
    meta: {
      resourceType: 'User',
      created: user.createdAt,
      location: `/api/scim/v2/Users/${user.id}`,
    },
  }
}

function scimError(res: Response, status: number, detail: string) {
  res.status(status).json({
    schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
    detail,
    status: String(status),
  })
}

function requestedRole(input: unknown): Role {
  if (!Array.isArray(input)) return 'viewer'
  const value = (input[0] as { value?: unknown } | undefined)?.value
  return typeof value === 'string' && roles.includes(value as Role) ? (value as Role) : 'viewer'
}

scimRouter.use(requireScimToken)
scimRouter.use((_req, res, next) => {
  res.type('application/scim+json')
  next()
})

scimRouter.get('/ServiceProviderConfig', (_req, res) => {
  res.json({
    schemas: ['urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig'],
    patch: { supported: true },
    bulk: { supported: false, maxOperations: 0, maxPayloadSize: 0 },
    filter: { supported: true, maxResults: 200 },
    changePassword: { supported: false },
    sort: { supported: false },
    etag: { supported: false },
    authenticationSchemes: [{ type: 'oauthbearertoken', name: 'Bearer Token', primary: true }],
  })
})

scimRouter.get('/Users', async (req, res) => {
  const filter = req.query.filter?.toString()
  let users = await listUserRecords()
  const match = filter?.match(/^userName\s+eq\s+"([^"]+)"$/i)
  if (match) users = users.filter((user) => user.email.toLowerCase() === match[1].toLowerCase())
  const startIndex = Math.max(1, Number(req.query.startIndex ?? 1))
  const count = Math.min(200, Math.max(1, Number(req.query.count ?? 100)))
  const resources = users.slice(startIndex - 1, startIndex - 1 + count).map(scimUser)
  res.json({
    schemas: ['urn:ietf:params:scim:api:messages:2.0:ListResponse'],
    totalResults: users.length,
    startIndex,
    itemsPerPage: resources.length,
    Resources: resources,
  })
})

scimRouter.get('/Users/:id', async (req, res) => {
  const user = await findUserById(param(req.params.id))
  if (!user) {
    scimError(res, 404, 'User not found')
    return
  }
  res.json(scimUser(user))
})

scimRouter.post('/Users', async (req, res) => {
  const body = req.body as {
    externalId?: string
    userName?: string
    displayName?: string
    name?: { formatted?: string }
    active?: boolean
    roles?: unknown
  }
  const email = body.userName?.trim().toLowerCase()
  const externalId = body.externalId?.trim()
  if (!email || !email.includes('@')) {
    scimError(res, 400, 'A valid userName email is required')
    return
  }
  if (
    (externalId && (await findUserByScimExternalId(externalId))) ||
    (await findUserByEmail(email))
  ) {
    scimError(res, 409, 'User already exists')
    return
  }
  const user = await createUser({
    email,
    name: body.displayName ?? body.name?.formatted ?? email,
    role: requestedRole(body.roles),
    provider: 'oidc',
    scimExternalId: externalId ?? email,
  })
  if (body.active === false) {
    await updateProvisionedUser(user.id, { disabled: true })
  }
  res.status(201).json(scimUser((await findUserById(user.id))!))
})

scimRouter.patch('/Users/:id', async (req, res) => {
  const user = await findUserById(param(req.params.id))
  if (!user) {
    scimError(res, 404, 'User not found')
    return
  }
  const operations = (req.body as { Operations?: Array<{ op?: string; path?: string; value?: unknown }> }).Operations
  if (!Array.isArray(operations)) {
    scimError(res, 400, 'SCIM PATCH Operations are required')
    return
  }
  const patch: { email?: string; name?: string; role?: Role; disabled?: boolean } = {}
  for (const operation of operations) {
    if (!operation.op || !['add', 'replace'].includes(operation.op.toLowerCase())) continue
    const path = operation.path?.toLowerCase()
    if (path === 'active' && typeof operation.value === 'boolean') patch.disabled = !operation.value
    if ((path === 'displayname' || path === 'name.formatted') && typeof operation.value === 'string') patch.name = operation.value
    if (path === 'username' && typeof operation.value === 'string') patch.email = operation.value
    if (path === 'roles') patch.role = requestedRole(operation.value)
  }
  await updateProvisionedUser(user.id, patch)
  if (patch.disabled === true || patch.role) await revokeUserSessions(user.id)
  res.json(scimUser((await findUserById(user.id))!))
})

# API reference

Authoritative HTTP surface of the Express API (`server/src/app.ts` and the routers it mounts). All JSON. The Vite dev server proxies `/api` → `http://localhost:3001`.

Mutations of project state go through `POST /api/projects/:id/actions`. The server validates the action, enforces RBAC, runs the shared reducer, and persists under optimistic concurrency. Do not bypass the reducer.

## Auth model

| Mechanism | When it works | How |
|---|---|---|
| Bearer session JWT | Always | `Authorization: Bearer <token>` from `/login`, `/oidc`, or demo `/token`. HMAC-HS256, issuer `JWT_ISSUER` (default `project-controls`, **import-time**), audience `project-controls-api`. |
| Demo `x-pc-role` | Only when `DEMO_AUTH` is on **and** `NODE_ENV` is not `production` | Known role → that demo user. **Empty/missing header → `cost_controller`**. Unknown value → anonymous (`null`), not a fallback role. Ignored when demo auth is off. |
| Unauthenticated | Never for project/platform routes | `401 Authentication required`. |

`attachUser` prefers the **user-store** record (role, disabled flag) over JWT claims. Invalid Bearer tokens do **not** fall back to `x-pc-role`. Demo `/token` subjects that are not in the user store are honoured only while demo auth is on.

Roles (rank): `viewer` < `cost_controller` < `approver` < `admin`. Project membership (`ENFORCE_PROJECT_MEMBERSHIP`, default **on** in production) further restricts non-admins to assigned projects.

Minimum role per `ProjectAction` type: `server/src/auth/actionPolicy.ts`. Client-blocked types (`ADD_AUDIT`, `HYDRATE`, `RESET`) return 403 even for admins.

## Health

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/api/health` | none | `{ ok, version: "1.0.0", service, postgres }`. Probes the DB when `DATABASE_URL` is set; **503** if the probe fails. There is no `ready` field on this payload. |
| GET | `/api/health/live` | none | Process up. `{ ok, service }`. |
| GET | `/api/health/ready` | none | DB reachable when Postgres is configured; **503** `{ ok: false }` otherwise. |

These three are registered **after** the global rate limiter.

## Auth — `/api/platform/auth`

| Method | Path | Min role | Body / notes |
|---|---|---|---|
| GET | `/config` | public | `{ demoAuthEnabled, oidcEnabled }`. No secrets. |
| POST | `/login` | public | `{ email, password }` → `{ token, user, expiresIn }`. Rate-limited (10 / 15 min). |
| POST | `/oidc` | public | `{ idToken }` — exchange a verified IdP ID token for a session. **404** if OIDC is not configured. **409** if the email cannot be linked. |
| POST | `/register` | admin | `{ email, name, role, password }` (password ≥ 8). **409** on duplicate email. |
| GET | `/me` | viewer | `{ user, globalRole }`. |
| GET | `/users` | admin | `{ users }` (public fields only). |
| POST | `/token` | demo only | `{ userId?, role? }` mints a demo JWT. Match is `DEMO_USERS` by id or role; unknown → `DEMO_USERS[1]` (cost_controller). **404** unless demo auth is enabled. |

Bootstrap admin: on first start, if no users exist and `ADMIN_EMAIL` + `ADMIN_PASSWORD` are set, that account is created (`ensureBootstrapAdmin`). Production requires password length ≥ 12.

OIDC is on only when **both** `OIDC_ISSUER` and `OIDC_CLIENT_ID` are set. The server verifies the ID token against the issuer JWKS (`OIDC_JWKS_URI` or `<issuer>/.well-known/jwks.json`) and provisions/links a local user. `email_verified` is **not** checked. `OIDC_CLIENT_SECRET` is unused. This is token-exchange only — not Authorization Code + PKCE. The SPA SSO button also needs `VITE_OIDC_LOGIN_URL`.

## Projects — `/api/projects`

| Method | Path | Min role | Notes |
|---|---|---|---|
| GET | `/` | viewer | `{ projects }`. Non-admins see only membership-allowed ids when enforcement is on. |
| GET | `/active` | viewer | `{ state, version }`. **403** if the caller cannot access the active project. |
| GET | `/:id` | viewer | `{ state, version }`. |
| POST | `/:id/activate` | cost_controller | Makes this the active project. |
| POST | `/:id/actions` | per action | Apply one `ProjectAction`. See concurrency below. |
| POST | `/:id/reset` | admin | Restore seed state for that project. |

`:id` must be a path-safe identifier (rejected with **400** if it looks like traversal).

### Optimistic concurrency

`POST .../actions` reads `If-Match` as a positive integer (the `version` from the last GET). **Omitting the header skips the version check** (`expectedVersion` is `undefined`). The SPA sends it only from `dispatchAction` (`src/api/client.ts`). On mismatch the store returns **409**:

```json
{ "error": "Version conflict — refresh and retry", "version": 12 }
```

Postgres uses `SELECT … FOR UPDATE` plus a version-conditional `UPDATE` in a transaction. The JSON file store replaces the file atomically (temp + fsync + rename) but has **no mutex** — concurrent Node requests can still race in memory; it also caches the whole file. Active project in Postgres is `app_settings.active_project_id`. Seed ids: `proj-demo-001`, `proj-benchmark-002`, `proj-benchmark-003`.

Success sets `X-State-Version` and returns `{ state, version }`.

Invalid action envelope → **400** with Zod `issues`. Domain/workflow violations → **400** with a message.

## Compute — `/api/projects/:id/compute`

Mounted with the same project-membership guard as other `:projectId` routers.

| Method | Path | Min role | Response |
|---|---|---|---|
| GET | `/forecast` | viewer | `{ totals, rows }` — `rows` is the **count** of per-WBS snapshots, not the snapshot array. |
| GET | `/evm` | viewer | `{ summary: { bac, ev, ac, eac }, accounts }` — `accounts` is the **count** of control-account rows, not the account list. |

## Enterprise — `/api/projects/:id`

| Method | Path | Min role | Notes |
|---|---|---|---|
| GET | `/audit` | viewer | `{ events, integrity }` from the append-only JSONL chain (`server/data/audit/{id}.jsonl`). |
| GET | `/baselines` | viewer | Snapshot list. |
| GET | `/baselines/:snapshotId` | viewer | One snapshot. **404** if missing. |
| POST | `/baselines` | approver | `{ label?, notes? }` — snapshot of cost sheet / WBS / BoE. Status is **`sanctioned` immediately** (the `working → proposed → sanctioned` workflow in `workflowConfig.ts` is not applied). No helpers in `src/api/client.ts`. |
| POST | `/baselines/:snapshotId/lock` | admin | Lock a sanctioned snapshot. |
| GET | `/exports/close-pack` | viewer | JSON close-pack bundle. |
| GET | `/exports/close-pack.pdf` | viewer | PDF (`Content-Disposition` attachment). |
| GET | `/portfolio/rollup` | viewer | Redirect note: use `/api/platform/portfolio/governance`. |

Baselines live on the filesystem under `server/data/baselines/{projectId}/`. They are **not** in Postgres today.

## Platform — `/api/platform`

| Method | Path | Min role | Notes |
|---|---|---|---|
| GET/POST | `/filters` | viewer | Saved filters. GET returns the caller's rows **plus** `shared: true`. POST body `{ name, scope, payload, shared? }`. The SPA never sends `shared: true`. |
| DELETE | `/filters/:filterId` | viewer | Owner-only (`user_id` match). **204**. |
| GET | `/workflows` | viewer | `{ workflows }` from `src/data/workflowConfig.ts`. |
| GET | `/workflows/delegations` | viewer | Postgres table or `server/data/workflow_delegations.json`. |
| POST | `/workflows/delegations` | admin | `{ workflowId, projectId?, fromUserId, toUserId, until }`. |
| GET | `/portfolio/governance` | viewer | `{ policy, rollup }` from the **active project's** `portfolioProjects` array (includes inactive benchmarks; no `isActive` filter). Policy is hardcoded (`cpiWarningThreshold` 0.92, `$5M` open-change cap) in `portfolioService.ts`. **503** if no active project. |
| GET/POST | `/projects/:id/roles` | admin | Membership. POST `{ userId, role }`. |
| POST | `/integrations/oauth/:connectorId` | admin | Stores tokens encrypted at rest. |
| POST | `/integrations/sync` | admin | `{ connectorId, domain, projectId }` — simulated adapter run. |
| GET | `/integrations/adapters` | viewer | Optional `?domain=`. In-memory adapters always report `configured: false` (`listAdaptersByDomain` does not look at stored OAuth). `sap-s4` sync uses **sample rows**, not the live ERP. |
| POST | `/webhooks/:connectorId` | HMAC | Inbound connector webhook. See below. |
| GET | `/projects/:id/export-jobs` | viewer | Scheduled close-pack jobs. |
| POST | `/projects/:id/export-jobs` | cost_controller | `{ scheduleCron? }` only (`packType` is not in the POST schema; defaults to `close_pack`). Cron is stored but the runner uses a fixed hourly tick + `next_run_at` (1st of next month 06:00 local), not a cron parser. Generated PDF bytes are discarded. |

### Webhooks

`POST /api/platform/webhooks/:connectorId` is **not** role-gated. It requires HMAC-SHA256 of the **raw** body:

- Header: `x-webhook-signature: sha256=<hex>` (or bare hex)
- Secret: `WEBHOOK_SECRET_<CONNECTOR>` if set, else `WEBHOOK_SECRET`
- Production with no secret → **401**
- Dev/test with no secret → allowed (local demos)

## Error shape

| Status | Typical cause |
|---|---|
| 400 | Zod/domain/workflow validation, unsafe `projectId` |
| 401 | Missing/invalid session, missing/invalid webhook signature |
| 403 | Role too low, blocked client action, no project membership |
| 404 | Unknown project / snapshot / filter; demo `/token` when demo auth is off; OIDC unconfigured |
| 409 | `If-Match` conflict, duplicate user, OIDC account clash |
| 422 | Webhook accepted but adapter rejected the payload |
| 429 | Login or global rate limit |
| 500 | Unexpected; production body is `{ error, errorId }` only |
| 503 | Health/readiness DB probe failed; portfolio rollup with no active project |

## Constraints worth knowing

- JSON body cap: `JSON_LIMIT` (default `1mb`).
- Global rate limit: `RATE_LIMIT_PER_MIN` (default 300/min). In-memory, per process — not shared across replicas. `DISABLE_RATE_LIMIT` is refused in production.
- CORS: `CORS_ORIGIN` comma-list. Production with it unset **denies** cross-origin (does not reflect).
- Integrators: connectors/sync are simulated handshakes, not live SAP/P6 OAuth. `sap-s4` is the only adapter with a stub `sync`; others fail with “not configured”.
- Intelligence views in the SPA render seed/demo extracts; they are not API resources.
- Close-pack JSON includes cost/EVM/change/audit/commitment/invoice/accrual/contingency/SCCS CSVs. Template `forecast_movement` exists in `teamReportTemplates` but is **not** added to the pack. Most file names are display names; SCCS is forced to `iso-19008-sccs-rollup.csv`.
- `SET_SELECTED_VALUE` is **viewer**-allowed and writes shared `selectedValueId` on the project blob.
- `downloadClosePackPdf` in the SPA throws a generic `Error('PDF download failed')` (no status body).

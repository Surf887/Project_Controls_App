# Public API

Authoritative HTTP surface for the Express server (`server/src/app.ts` and the routers it mounts). All paths below are relative to the API origin (Vite proxies `/api` → `http://localhost:3001` in development).

Mutating project state goes through `POST /api/projects/:projectId/actions`. The server validates the envelope (Zod), enforces RBAC (`server/src/auth/actionPolicy.ts`), runs domain/workflow gates, then applies `projectReducer` under optimistic concurrency.

## Auth model

Identity is established by `attachUser` (`server/src/middleware/auth.ts`), in this order:

1. **`Authorization: Bearer <session>`** — HMAC-verified HS256 token issued by this API (`iss` = `JWT_ISSUER` or `project-controls`, `aud` = `project-controls-api`).
2. **`x-pc-role`** — demo identity only when demo auth is on (never in production).

OIDC ID tokens are **not** accepted on ordinary requests. Exchange them once at `POST /api/platform/auth/oidc`.

### Demo auth

`isDemoAuthEnabled()` (`server/src/auth/rbac.ts`):

| Condition | Demo auth |
|---|---|
| `NODE_ENV=production` | Always off |
| `DEMO_AUTH=true` | On (non-prod only) |
| `DEMO_AUTH=false` | Off |
| Unset | On **only** when `NODE_ENV=development` |

The client role switcher and `x-pc-role` header also require `VITE_DEMO_AUTH=true` (compile-time). Tokens minted by `POST /api/platform/auth/token` use synthetic `DEMO_USERS` subjects; the server honours those subjects only while demo auth is on.

### Roles

`viewer` < `cost_controller` < `approver` < `admin`. Per-project membership (`ENFORCE_PROJECT_MEMBERSHIP`, default **on** in production) is applied by `attachProjectRole`. Global admins bypass membership. Project roles are assigned at `POST /api/platform/projects/:projectId/roles`.

Client-blocked action types (must not be posted to `/actions`): `ADD_AUDIT`, `HYDRATE`, `RESET`. Reset is the dedicated admin route below.

## Health

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/health` | none | Process up; pings Postgres when `DATABASE_URL` is set. `{ ok, version, service, postgres }`. `ok` is false (503) if the DB ping fails. There is no `ready` field. |
| GET | `/api/health/live` | none | Liveness. `{ ok, service }`. |
| GET | `/api/health/ready` | none | Readiness. 503 when the configured DB is unreachable. |

Use `/live` for restart policy and `/ready` for load-balancer gating.

## Authentication (`/api/platform/auth`)

| Method | Path | Min role | Purpose |
|---|---|---|---|
| GET | `/config` | none | `{ demoAuthEnabled, oidcEnabled }` — drives the login screen. |
| POST | `/login` | none | Password login. Body `{ email, password }`. Rate-limited (10 / 15 min). Returns `{ token, user, expiresIn }`. |
| POST | `/oidc` | none | Exchange `{ idToken }` for a session. 404 if OIDC is not configured. First login provisions a user at `OIDC_DEFAULT_ROLE` (default `viewer`). |
| POST | `/register` | admin | Provision a local user. |
| GET | `/me` | viewer | Current session user + global role. |
| GET | `/users` | admin | List users (public fields only). |
| POST | `/token` | none (demo only) | Mint a session for `{ role }` or `{ userId }`. 404 unless demo auth is on. |

Session lifetime is `SESSION_TTL_SEC` (default 3600). There is **no refresh endpoint**; the client stores `pc-expires-at` and prompts re-login.

First-run bootstrap: if the user store is empty and `ADMIN_EMAIL` + `ADMIN_PASSWORD` are set, `ensureBootstrapAdmin()` creates that admin at startup.

## Projects

| Method | Path | Min role | Purpose |
|---|---|---|---|
| GET | `/api/projects` | viewer | List projects (membership-filtered when enforcement is on). |
| GET | `/api/projects/active` | viewer | Active project `{ state, version }`. 403 if the caller cannot access it. |
| GET | `/api/projects/:projectId` | viewer | Project state + version. |
| POST | `/api/projects/:projectId/activate` | cost_controller | Make this project active. |
| POST | `/api/projects/:projectId/actions` | per-action | Apply one `ProjectAction`. Send `If-Match: <version>`. |
| POST | `/api/projects/:projectId/reset` | admin | Restore seed data for that project. |

### Actions and concurrency

```http
POST /api/projects/proj-alpha/actions
Authorization: Bearer <token>
If-Match: 12
Content-Type: application/json

{ "type": "SET_COST_SHEET", "payload": { ... } }
```

Success returns `{ state, version }` and `X-State-Version`.

| Status | Meaning |
|---|---|
| 400 | Invalid envelope, unknown action, or domain/workflow validation failure. |
| 401 | Missing/invalid session. |
| 403 | Role too low, blocked client action, or no project membership. |
| 409 | Version conflict. Body `{ error, version }` with the current server version. Re-load and retry. |

The client (`src/api/client.ts`) always sends `If-Match` from the last loaded version. On 409 the UI reloads server state and asks the user to re-apply the edit.

## Compute

Mounted at `/api/projects/:projectId/compute` (membership enforced).

| Method | Path | Min role | Response |
|---|---|---|---|
| GET | `/forecast` | viewer | `{ totals, rows }` — control-account forecast roll-up. |
| GET | `/evm` | viewer | EVM summary from the live cost sheet. |

## Enterprise (audit, baselines, exports)

Mounted at `/api/projects/:projectId`.

| Method | Path | Min role | Purpose |
|---|---|---|---|
| GET | `/audit` | viewer | Append-only JSONL events + `{ integrity: { ok, errors } }`. |
| GET | `/baselines` | viewer | Snapshot list. |
| GET | `/baselines/:snapshotId` | viewer | One snapshot. |
| POST | `/baselines` | approver | Create a sanctioned snapshot from current cost sheet / WBS / BoE. Body `{ label?, notes? }`. |
| POST | `/baselines/:snapshotId/lock` | admin | Lock a snapshot. |
| GET | `/exports/close-pack` | viewer | JSON close-pack bundle (files + mime types). |
| GET | `/exports/close-pack.pdf` | viewer | PDF close pack (`server/src/services/pdfExport.ts`). |
| GET | `/portfolio/rollup` | viewer | Redirect note — use `/api/platform/portfolio/governance`. |

Audit files live under `server/data/audit/{projectId}.jsonl` (or `AUDIT_DIR`). The chain is SHA-256 over each record plus `prevHash` (see `SECURITY.md`). Baselines are files under `server/data/baselines/{projectId}/`.

## Platform

| Method | Path | Min role | Purpose |
|---|---|---|---|
| GET/POST/DELETE | `/api/platform/filters` | viewer | Saved filters (optional `?scope=`). POST body `{ name, scope, payload, shared? }`. |
| GET | `/api/platform/workflows` | viewer | Workflow definitions from `src/data/workflowConfig.ts`. |
| GET | `/api/platform/workflows/delegations` | viewer | Delegation list (Postgres or `server/data/workflow_delegations.json`). |
| POST | `/api/platform/workflows/delegations` | admin | Create a delegation `{ workflowId, projectId?, fromUserId, toUserId, until }`. |
| GET | `/api/platform/portfolio/governance` | viewer | Default PMO policy + roll-up of the **active** project. |
| GET/POST | `/api/platform/projects/:projectId/roles` | admin | List / assign `{ userId, role }`. |
| GET/POST | `/api/platform/projects/:projectId/export-jobs` | viewer / cost_controller | Scheduled close-pack jobs. |
| GET | `/api/platform/integrations/adapters` | viewer | Adapter registry (`?domain=`). |
| POST | `/api/platform/integrations/oauth/:connectorId` | admin | Store connector OAuth tokens (encrypted at rest). |
| POST | `/api/platform/integrations/sync` | admin | Run a simulated inbound sync job. |
| POST | `/api/platform/webhooks/:connectorId` | HMAC | Inbound webhook. Header `x-webhook-signature: sha256=<hex>` (bare hex also accepted). |

### Webhook secrets

`WEBHOOK_SECRET_<CONNECTOR>` overrides `WEBHOOK_SECRET` (`connectorId` uppercased, non-alphanumerics → `_`). In production a missing secret is 401; in development unsigned requests are allowed so local demos work.

### Export jobs — constraint

`scheduleCron` is stored but **not executed as cron**. `runDueExportJobs` (`server/src/index.ts`) polls hourly and advances `nextRunAt` to 06:00 UTC on the first of next month (`exportScheduler.ts`). Custom cron expressions do not change when the job fires.

## Workflows (server-enforced)

Definitions: `src/data/workflowConfig.ts`. Gates: `server/src/services/workflowEngine.ts` (called from `database.ts` before the reducer).

| Workflow id | Transitions (from → to) | Min role | Action |
|---|---|---|---|
| `forecast-approval` | draft → under_review | cost_controller | `SUBMIT_FORECAST` |
| | under_review → approved | approver | `APPROVE_FORECAST` |
| | under_review → rejected | approver | `REJECT_FORECAST` |
| | rejected → draft | cost_controller | (status only) |
| `change-board` | draft → submitted | cost_controller | `SUBMIT_CHANGE` |
| | submitted / under_review → approved \| rejected | approver | `DECIDE_CHANGE` |
| `monthly-close` | open → reconciled → vowd_reviewed → changes_cleared → ready_for_forecast | cost_controller / approver | Guided UI at `/close` (progress in `src/engine/monthlyCloseProgress.ts`) |
| `baseline-sanction` | working → proposed → sanctioned → locked | cost_controller / approver / admin | Baseline routes above |

Monthly close **gates** in the UI are derived from live state (open accruals, unmapped CBS, pending changes, etc.). The `monthly-close` workflow id is published on `/workflows` but is not yet asserted in `workflowEngine.ts` the way forecast/change transitions are.

## Production static hosting

When `NODE_ENV=production` and `SERVE_CLIENT` is not `false`, the API serves the Vite `dist/` bundle and SPA-fallbacks any non-`/api/` path to `index.html`.

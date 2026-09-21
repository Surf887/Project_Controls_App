# Public API

Authoritative HTTP surface for the Express server (`server/src/app.ts` and the routers it mounts). All paths below are relative to the API origin (Vite proxies `/api` → `http://localhost:3001` in development).

Mutating project state goes through `POST /api/projects/:projectId/actions`. The server validates the envelope (Zod), enforces RBAC (`server/src/auth/actionPolicy.ts`), runs domain/workflow gates, then applies `projectReducer` under optimistic concurrency.

## Auth model

Identity is established by `attachUser` (`server/src/middleware/auth.ts`), in this order:

1. **`Authorization: Bearer <session>`** — HMAC-verified HS256 token issued by this API (`iss` = `JWT_ISSUER` or `project-controls`, `aud` = `project-controls-api`).
2. **`x-pc-role`** — demo identity only when demo auth is on (never in production).

OIDC ID tokens are **not** accepted on ordinary requests. Exchange them once at `POST /api/platform/auth/oidc`. The exchange verifies the ID token against the issuer JWKS (`OIDC_ISSUER` + `OIDC_CLIENT_ID`). `OIDC_CLIENT_SECRET` is listed in `.env.example` but is **not read** by `server/src/auth/oidc.ts`.

Demo tokens minted by `POST /api/platform/auth/token` use synthetic `DEMO_USERS` subjects that are not in the user store. The server honours those subjects only while demo auth is on.

### Demo auth

`isDemoAuthEnabled()` (`server/src/auth/rbac.ts`):

| Condition | Demo auth |
|---|---|
| `NODE_ENV=production` | Always off |
| `DEMO_AUTH=true` | On (non-prod only) |
| `DEMO_AUTH=false` | Off |
| Unset | On **only** when `NODE_ENV=development` |

The client role switcher and `x-pc-role` header also require `VITE_DEMO_AUTH=true` (compile-time).

### Roles

`viewer` < `cost_controller` < `approver` < `admin`. Per-project membership (`ENFORCE_PROJECT_MEMBERSHIP`, default **on** in production) is applied by `attachProjectRole`. Global admins bypass membership. Project roles are assigned at `POST /api/platform/projects/:projectId/roles`.

Client-blocked action types (must not be posted to `/actions`): `ADD_AUDIT`, `HYDRATE`, `RESET`. Reset is the dedicated admin route below.

## Health

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/health` | none | Process up; pings Postgres when `DATABASE_URL` is set. `{ ok, version, service, postgres }`. `ok` is false (HTTP 503) if the DB ping fails. There is no `ready` field. |
| GET | `/api/health/live` | none | Liveness. `{ ok, service }`. |
| GET | `/api/health/ready` | none | Readiness. 503 when the configured DB is unreachable. `{ ok, postgres }`. |

Use `/live` for restart policy and `/ready` for load-balancer gating. The Docker image `HEALTHCHECK` calls `/api/health` and treats a non-OK HTTP status as unhealthy (it also inspects a `ready` JSON field that this endpoint does not emit). Compose’s healthcheck uses HTTP status only.

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

First-run bootstrap: if the user store is empty and `ADMIN_EMAIL` + `ADMIN_PASSWORD` are set, `ensureBootstrapAdmin()` creates that admin at startup (`ADMIN_NAME` defaults to `Administrator`).

`JWT_ISSUER` is captured when `server/src/auth/jwt.ts` is first imported — **before** `loadRootEnvFile()` runs. Putting `JWT_ISSUER` only in a `.env` file has no effect; set it in the process environment (Compose already injects it). `JWT_SECRET` is read at call time and *does* pick up the file loader.

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

`If-Match` is parsed as `Number(...)` (not a Zod positive-integer check). Constraints:

- **Omit the header** and `expectedVersion` is `undefined` — the store **skips** the conflict check (last writer wins). The SPA always sends it (`src/api/client.ts`); scripts and tests must too.
- **Non-numeric values** become `NaN`. `NaN` never equals a stored version, so the request 409s.
- On 409 the UI reloads server state and asks the user to re-apply the edit.

### Action RBAC (`ACTION_MIN_ROLE`)

Minimum role for each `ProjectAction.type`. Source of truth: `server/src/auth/actionPolicy.ts`. Unknown types are 400; blocked client types are 403. The client helper `useProjectRole().canPerformAction` is a **subset** used for UI gating only — the server map is authoritative.

**viewer**

- `SET_SELECTED_VALUE`

**cost_controller** — register writes and submissions

- Estimate / structure: `SET_BASIS_OF_ESTIMATE`, `SET_WBS_NODES`, `SET_COST_SHEET`, `SET_CBS_NODES`, `SET_BURDEN_RULES`, `SET_DELIVERABLES`
- Registers: `SET_CHANGES`, `CREATE_CHANGE`, `SUBMIT_CHANGE`, `SET_RISKS`, `SET_OPPORTUNITIES`, `SET_ISSUES`, `SET_ACTIONS`, `SET_DECISIONS`, `SET_LESSONS`, `SET_CLAIMS`
- Commitments: `SET_PURCHASE_ORDERS`, `SET_CONTRACTS`, `SET_RFQ_BIDS`, `SET_INVOICES`, `SET_SUBCONTRACTS`, `SET_LONG_LEAD_ITEMS`, `SYNC_COMMITMENTS`
- Field / EPC: `SET_FIELD_DAILY_REPORTS`, `SET_FIELD_OBSERVATIONS`, `SET_TURNOVER_CHECKLISTS`, `SET_WORK_FRONTS`, `SET_PUNCH_LIST`
- Contingency / FX: `SET_CONTINGENCY_DRAWS`, `SUBMIT_CONTINGENCY_DRAW`, `SET_CONTINGENCY_RULES`, `RECONCILE_CONTINGENCY`, `SET_FX_RATES`, `SET_FX_SETTINGS`
- Progress / accruals: `SET_RULE_OF_CREDIT_TEMPLATES`, `SET_PROGRESS_CREDITS`, `UPDATE_PROGRESS_CREDIT`, `SET_COST_ACCRUALS`, `UPDATE_COST_ACCRUAL`, `RECONCILE_ACCRUALS`
- Forecast / reports: `UPDATE_FORECAST_APPROVAL`, `SUBMIT_FORECAST`, `ADD_GENERATED_REPORT`, `SET_REPORTS`, `SET_VALUES`, `SYNC_PORTFOLIO`, `APPLY_APPROVED_EXTRACTIONS`

**approver**

- `APPROVE_FORECAST`, `REJECT_FORECAST`, `DECIDE_CHANGE`, `LOCK_REPORTING_PERIOD`, `APPROVE_CONTINGENCY_DRAW`

**admin**

- `SET_META`, `SET_SETTINGS`, `SET_VENDORS`, `SET_CONNECTORS`, `UPDATE_CONNECTOR`, `ADD_SYNC_JOB`, `SET_FORECAST_APPROVALS`, `UNLOCK_REPORTING_PERIOD`

`RESET` is not an `/actions` type — use `POST .../reset`. `LOCK_REPORTING_PERIOD` is approver, not cost_controller.

## Compute

Mounted at `/api/projects/:projectId/compute` (membership enforced).

| Method | Path | Min role | Response |
|---|---|---|---|
| GET | `/forecast` | viewer | `{ totals, rows }` — `rows` is the **count** of forecast snapshots, not the row payloads. Totals are control-account grain. |
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

Audit files are `{dataRoot}/audit/{projectId}.jsonl` (override with `AUDIT_DIR`). The chain is SHA-256 over each record plus `prevHash` (see `SECURITY.md`). Baselines are `{dataRoot}/baselines/{projectId}/`.

`dataRoot` is `../../data` from `import.meta.url` of the compiled module:

| How the API runs | `dataRoot` | SQL migrations directory |
|---|---|---|
| `tsx` (`npm run dev:server`) | `server/data` | `server/src/db/migrations` |
| Bundled `server/dist/index.js` | repo-root `data/` | `server/dist/migrations` |

The production `Dockerfile` copies `server/dist` JS and the client `dist/`, not the `.sql` files and not `server/data`. See `DEPLOYMENT.md`.

## Platform

| Method | Path | Min role | Purpose |
|---|---|---|---|
| GET/POST/DELETE | `/api/platform/filters` | viewer | Saved filters (optional `?scope=`). POST body `{ name, scope, payload, shared? }`. DELETE returns 204. |
| GET | `/api/platform/workflows` | viewer | Workflow definitions from `src/data/workflowConfig.ts`. |
| GET | `/api/platform/workflows/delegations` | viewer | Delegation list (Postgres or `{dataRoot}/workflow_delegations.json`). |
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
| | submitted → under_review | cost_controller | (status only) |
| | submitted / under_review → approved \| rejected | approver | `DECIDE_CHANGE` |
| `monthly-close` | open → reconciled → vowd_reviewed → changes_cleared → ready_for_forecast | cost_controller / approver | Guided UI at `/close` — **not** asserted in `workflowEngine.ts` |
| `baseline-sanction` | working → proposed → sanctioned → locked | cost_controller / approver / admin | Published on `/workflows`; create/lock use the baseline routes (approver create, admin lock) |

## Monthly close gates (UI)

`evaluateMonthlyClose` (`src/engine/monthlyCloseProgress.ts`) derives step status from live project data. Later steps stay **blocked** until the prior step is complete. These are UI gates, not `workflowEngine` assertions.

| Step | Completes when | Typical blockers |
|---|---|---|
| 1 Setup baseline | BoE scope + methodology + preparedBy, and at least one control account | Missing BoE narrative or empty cost sheet |
| 2 Import / update WBS | WBS nodes exist and every control account has a CBS mapping | Unmapped control accounts |
| 3 Reconcile actuals & accruals | No accrual in `draft` or `reviewed` | Draft/reviewed entries still open |
| 4 Review VOWD | Progress credits exist and every credit has at least one earned step | No RoC progress, or stale credits |
| 5 Approve changes | No CO in `submitted` / `under_review` | Board queue not empty (draft/pending COs do not block) |
| 6 Run forecast | A draft or under-review package exists with `eacTotalUsd > 0` | Forecast package not created |
| 7 Submit package | A forecast package is **approved** | Still draft / under review |
| 8 Generate reports | At least one generated team report **or** an approved forecast | No export yet |

Landing route: `/close`. Command palette: Ctrl/Cmd+K.

## Production static hosting

When `NODE_ENV=production` and `SERVE_CLIENT` is not `false`, the API serves the Vite `dist/` bundle (`../../dist` from `server/dist/index.js` → repo-root `dist/`, which the Docker image copies) and SPA-fallbacks any non-`/api/` path to `index.html`.

# Public API

Authoritative HTTP surface for the Express server (`server/src/app.ts` and the routers it mounts). All paths below are relative to the API origin (Vite proxies `/api` → `http://localhost:3001` in development).

Mutating project state goes through `POST /api/projects/:projectId/actions`. The server validates the envelope (Zod), enforces RBAC (`server/src/auth/actionPolicy.ts`), runs domain/workflow gates, then applies `projectReducer` under optimistic concurrency.

## Auth model

Identity is established by `attachUser` (`server/src/middleware/auth.ts`), in this order:

1. **`Authorization: Bearer <session>`** — HMAC-verified HS256 token issued by this API (`iss` = `JWT_ISSUER` or `project-controls`, `aud` = `project-controls-api`).
2. **`x-pc-role`** — demo identity only when demo auth is on (never in production). If demo auth is on and the header is **missing or empty**, the identity is the **cost_controller** demo user (`demoUserFromRole` in `rbac.ts`). Any unauthenticated request in local development is therefore a controller, not anonymous.

OIDC ID tokens are **not** accepted on ordinary requests. Exchange them once at `POST /api/platform/auth/oidc`. The exchange verifies the ID token against the issuer JWKS (`OIDC_ISSUER` + `OIDC_CLIENT_ID`). `OIDC_CLIENT_SECRET` is listed in `.env.example` but is **not read** by `server/src/auth/oidc.ts`.

Demo tokens minted by `POST /api/platform/auth/token` use synthetic `DEMO_USERS` subjects that are not in the user store. The server honours those subjects only while demo auth is on. An unknown `{ role }` / `{ userId }` silently falls back to **cost_controller** (`DEMO_USERS[1]`).

For **persisted** users, `attachUser` reloads `findUserById(claims.sub)` and uses the **store** `role` / `name` / `disabled` flags — JWT claims other than `sub` are ignored. Disable the row (`setUserDisabled` in `userStore.ts`; no HTTP route) and the next request is unauthenticated. Password login for a disabled account still returns generic `401 Invalid email or password`. OIDC returns `403 Account disabled`.

### Demo auth

`isDemoAuthEnabled()` (`server/src/auth/rbac.ts`):

| Condition | Demo auth |
|---|---|
| `NODE_ENV=production` | Always off |
| `DEMO_AUTH=true` | On (non-prod only) |
| `DEMO_AUTH=false` | Off |
| Unset | On **only** when `NODE_ENV=development` |

Client chrome (`src/App.tsx`): `VITE_DEMO_AUTH === 'true' || import.meta.env.DEV`. Vite **dev** shows the demo login / role switcher even when `VITE_DEMO_AUTH` is false. Production builds stay off unless that flag is true. The login screen also shows demo buttons when `authConfig.demoAuthEnabled` is true (`demoAuthAvailable = clientDemoAuth || authConfig?.demoAuthEnabled`).

When `GET /api/platform/auth/config` reports `demoAuthEnabled` and the SPA has no token, `projectStore` **auto-mints** a demo session (`POST /token` using `localStorage['pc-role']`, default cost_controller) and skips the login screen. The top-bar role switcher remints `/token` rather than relying on `x-pc-role`. The client sends `x-pc-role` **only** when `VITE_DEMO_AUTH === 'true'` and there is no Bearer token — Vite `DEV` chrome can show while that header is still off. A reachable API with demo auth **off** and no credentials shows login — it does **not** fall back to `localStorage`. Offline `localStorage` is only used when health/connect throws for a non-auth reason.

### Roles

`viewer` < `cost_controller` < `approver` < `admin`. Per-project membership (`ENFORCE_PROJECT_MEMBERSHIP`, default **on** in production) is applied by `attachProjectRole`. Global admins bypass membership. Project roles are assigned at `POST /api/platform/projects/:projectId/roles`.

`effectiveRole` (`server/src/auth/projectRoles.ts`) **replaces** the global role when a project assignment exists — it is not `max(global, project)`. A global approver assigned `viewer` on a project becomes a viewer on that project’s routes. Absence of a project role falls back to the global role (or 403 when membership is enforced).

There is **no HTTP route** for `setUserDisabled` / `setUserRole` in `userStore.ts`. Admins can register users and assign **project** roles; disabling an account or changing the global role requires a direct store edit.

Client-blocked action types (must not be posted to `/actions`): `ADD_AUDIT`, `HYDRATE`, `RESET`. Reset is the dedicated admin route below.

## Health

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/health` | none | Process up; pings Postgres when `DATABASE_URL` is set. `{ ok, version, service, postgres }`. `ok` is false (HTTP 503) if the DB ping fails. There is no `ready` field. |
| GET | `/api/health/live` | none | Liveness. `{ ok, service }`. |
| GET | `/api/health/ready` | none | Readiness. 503 when the configured DB is unreachable. `{ ok, postgres }`. |

Use `/live` for restart policy and `/ready` for load-balancer gating. The image `HEALTHCHECK` calls `/api/health`, fails on a non-OK HTTP status, then compares `j.ready === false`. That field is **not emitted**, so `undefined === false` is a no-op — health is HTTP status only. Compose’s healthcheck uses `r.ok` only.

## Authentication (`/api/platform/auth`)

| Method | Path | Min role | Purpose |
|---|---|---|---|
| GET | `/config` | none | `{ demoAuthEnabled, oidcEnabled }` — drives the login screen. |
| POST | `/login` | none | Password login. Body `{ email, password }`. Rate-limited (10 / 15 min). Returns `{ token, user, expiresIn }`. Unknown emails still run bcrypt against a dummy `$2a$12$000…` hash so timing does not leak whether the account exists. |
| POST | `/oidc` | none | Exchange `{ idToken }` for a session. 404 if OIDC is not configured. First login provisions a user at `OIDC_DEFAULT_ROLE` (default `viewer`). **409** if the email already belongs to a local password account, or is linked to a different `sub`. |
| POST | `/register` | admin | Provision a local user. Body `{ email, name, role, password }` (`password` 8–200 chars). 409 if the email exists. |
| GET | `/me` | viewer | `{ user, globalRole }`. This router does **not** run `attachProjectRole`, so both fields are the **global** role. |
| GET | `/users` | admin | List users (public fields only). |
| POST | `/token` | none (demo only) | Mint a session for `{ role }` or `{ userId }`. 404 unless demo auth is on. |

Session lifetime is `SESSION_TTL_SEC` (default 3600). There is **no refresh endpoint**; the client stores `pc-expires-at` and clears the session ~5 seconds before expiry (`projectStore.scheduleExpiry`).

First-run bootstrap: if the user store is empty and `ADMIN_EMAIL` + `ADMIN_PASSWORD` are set, `ensureBootstrapAdmin()` creates that admin at startup (`ADMIN_NAME` defaults to `Administrator`).

ESM imports run before `loadRootEnvFile()`. These are captured at **module load** and ignore a `.env`-only value (export or inject them; Compose injects `JWT_ISSUER`):

| Variable | Captured in |
|---|---|
| `JWT_ISSUER` | `server/src/auth/jwt.ts` |
| `SESSION_TTL_SEC` | `server/src/routes/auth.ts` |
| `DATABASE_PATH` | `server/src/db/jsonProjectStore.ts` |
| `USERS_PATH`, `BCRYPT_ROUNDS` | `server/src/auth/userStore.ts` |

`JWT_SECRET`, `DATABASE_URL`, and OIDC flags are read at call time and *do* pick up the file loader.

## Projects

| Method | Path | Min role | Purpose |
|---|---|---|---|
| GET | `/api/projects` | viewer | List projects. When membership is on, non-admins with **no** `user_project_roles` rows get `[]`. Global admins see every project. |
| GET | `/api/projects/active` | viewer | Active project `{ state, version }`. 403 if the caller cannot access it. |
| GET | `/api/projects/:projectId` | viewer | Project state + version. |
| POST | `/api/projects/:projectId/activate` | cost_controller | Make this project active. |
| POST | `/api/projects/:projectId/actions` | per-action | Apply one `ProjectAction`. Send `If-Match: <version>`. |
| POST | `/api/projects/:projectId/reset` | admin | Restore seed data for that project. Keeps existing `meta` and `portfolioProjects`, increments `version`. |

First JSON-store seed (`createSeedState` + inactive portfolio clones):

| Id | Role |
|---|---|
| `proj-demo-001` | Active demo — Process Area A Expansion |
| `proj-benchmark-002` | Inactive portfolio clone — Utilities Upgrade Phase 2 |
| `proj-benchmark-003` | Inactive portfolio clone — Tank Farm De-bottleneck |

An empty/corrupt `projects.json` **re-seeds in non-production** and **throws in production**. `activate` / `reset` do **not** send `If-Match`.

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

- **Omit the header** and `expectedVersion` is `undefined` — the **version equality check is skipped**.
  - **Postgres** still serializes writers (`BEGIN` + `SELECT … FOR UPDATE` + version-conditional `UPDATE`). Concurrent omitted-header requests apply **in sequence** on top of each other; the first write is not discarded.
  - **JSON file store** has **no writer mutex**. Two in-flight `applyAction` calls can both read the same version and `rename` last-wins, dropping the other reducer result. Atomic temp+fsync+rename only prevents a torn `projects.json`, not lost updates. `JsonProjectStore` also **caches** the file in memory — hand-edits while the process is running are ignored until restart.
- **Non-numeric values** become `NaN`. `NaN` never equals a stored version, so the request 409s.
- On 409 the UI reloads server state and asks the user to re-apply the edit.
- Zod on `/actions` checks the **envelope** (`type` + a shallow payload). Most register writes use `.passthrough()` / `z.record` — financial bounds are **not** schema-enforced. Forecast/change submit-approve-reject payloads are the strict objects (`packageId`, `changeId`, …).
- Domain `validateProjectAction` (`src/engine/actionValidation.ts`) is **only** “cannot `LOCK_REPORTING_PERIOD` while approved extractions are still unapplied.” Forecast/change transitions are a separate `validateWorkflowGate` in `database.ts`.
- The SPA is **not** optimistic when the API is connected (`src/store/projectStore.tsx`). `dispatch` queues on `pendingRef`, POSTs `/actions` with `If-Match`, then `HYDRATE`s the server state. Offline mode applies the reducer locally. Overlapping calls use `actionSeqRef` so a stale response cannot overwrite a newer one. `dispatchAction` is the only client helper that sends `If-Match`.

Project ids (`assertSafeId`) must match `[a-zA-Z0-9._-]+`, length 1–128, with no `/`, `\\`, or `..`.

### Action RBAC (`ACTION_MIN_ROLE`)

Minimum role for each `ProjectAction.type`. Source of truth: `server/src/auth/actionPolicy.ts`. Unknown types are 400; blocked client types are 403. The client helper `canPerformAction` in `src/hooks/useProjectRole.ts` is a **subset** used for UI gating only (unknown types default to `cost_controller`). The server map is authoritative. The hook itself returns `{ role, canEdit, canApprove, isAdmin }` from `currentUser`, not `localStorage['pc-role']`.

**viewer**

- `SET_SELECTED_VALUE` — writes shared `selectedValueId` on the project JSON (contractor extraction workspace). One viewer’s click is persisted for every user. The UI `canEdit` flag (`role !== 'viewer'`) does **not** block this action; the server map does. There is **no** per-session selection.

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
| GET | `/evm` | viewer | `{ summary, accounts }` — `summary` is `{ bac, ev, ac, eac }` at control-account grain. `accounts` is the **count** of EVM accounts, not the account payloads (`computeService.ts`). |

## Enterprise (audit, baselines, exports)

Mounted at `/api/projects/:projectId`.

| Method | Path | Min role | Purpose |
|---|---|---|---|
| GET | `/audit` | viewer | Append-only **JSONL** events + `{ integrity: { ok, errors } }`. The SPA does **not** call this route (see dual audit below). |
| GET | `/baselines` | viewer | Snapshot list. |
| GET | `/baselines/:snapshotId` | viewer | One snapshot. |
| POST | `/baselines` | approver | Create a snapshot from current cost sheet / WBS / BoE with **`status: 'sanctioned'` immediately**. Body `{ label?, notes? }`. Does **not** walk `baseline-sanction` (`working → proposed → sanctioned`). `src/api/client.ts` has **no** baseline helpers — the SPA shows `state.meta.baselineLabel` only. |
| POST | `/baselines/:snapshotId/lock` | admin | Lock a snapshot. |
| GET | `/exports/close-pack` | viewer | JSON close-pack bundle (files + mime types). See file list below. `audit_activity` is **in-state** `state.auditLog`, not the JSONL store. |
| GET | `/exports/close-pack.pdf` | viewer | PDF close pack (`server/src/services/pdfExport.ts`, pdfkit). The SPA helper `downloadClosePackPdf` throws a generic `Error` (not `ApiError`) — a 401 here does **not** expire the session. |
| GET | `/portfolio/rollup` | viewer | `{ note }` pointing at `/api/platform/portfolio/governance`. The PMO dashboard calls that platform route (`fetchPortfolioGovernance`); this project-scoped alias is unused by the SPA. |

### Close-pack files

`generateClosePack` (`server/src/services/exportService.ts`) always starts with `00-executive-summary.txt`, then the templates below. Filenames are the **template display names** from `teamReportTemplates` (usually **no `.csv` extension**). Only the SCCS file is forced to `iso-19008-sccs-rollup.csv`. Grain is control accounts (`parentId === null`).

| Order | File `name` | Template id |
|---|---|---|
| 0 | `00-executive-summary.txt` | (inline) |
| 1 | `Monthly cost summary` | `cost_summary` |
| 2 | `EVM performance snapshot` | `evm_snapshot` |
| 3 | `Change pipeline status` | `change_pipeline` |
| 4 | `Audit activity extract` | `audit_activity` |
| 5 | `Commitment exposure report` | `commitment_report` |
| 6 | `Invoice status report` | `invoice_status` |
| 7 | `Accrual completeness report` | `accrual_report` |
| 8 | `Contingency drawdown report` | `contingency_report` |
| 9 | `iso-19008-sccs-rollup.csv` | `sccs_rollup` |

`forecast_movement` is a Team Reports template (`rpt-forecast`) and is **not** in the close pack.

### Contractor extractions

Posted through `/actions` (cost_controller except `SET_SELECTED_VALUE`):

| Action | Behaviour |
|---|---|
| `SET_VALUES` | `applyValuesUpdate` → `sanitizeExtractedValues` + `reverseIngestionPosting` for any previously applied value whose approval dropped or whose financial fields changed. |
| `APPLY_APPROVED_EXTRACTIONS` | Silent **no-op** (unchanged state, no audit row) if the reporting period is locked **or** `appliedCount === 0`. Otherwise posts via `selectApplicableBatch`. |
| `SET_SELECTED_VALUE` | Shared `selectedValueId` (see RBAC). |
| `LOCK_REPORTING_PERIOD` | **400** when `pendingApplyCount(state.values) > 0` (`actionValidation.ts`). |

`selectApplicableBatch` (`src/engine/ingestionPosting.ts`): last **cost** / **forecast** extraction per `category:wbs` wins (queue order). Every approved **change** extraction is kept additively (`change:${id}`). Only dual-approved (`reviewStatus` + `approvalStatus`), not-yet-applied, postable categories (`cost` / `forecast` / `change`) qualify.

SCCS “Reapply mappings” (`src/views/sccs.tsx`) dispatches `SET_COST_SHEET` then `SET_VALUES` with `enrichCostSheetRows` / `enrichExtractedValues`. Manual facet assignments win; otherwise WBS/CBS/phase mapping fills PBS·SAB·COR. `rollupCostSheetBySccs` skips WBS children (`parentId !== null`).

### Dual audit (in-state vs JSONL)

Two independent trails. Do not treat them as the same log.

| Trail | Writer | Cap / integrity | Who reads it |
|---|---|---|---|
| **In-state** `state.auditLog` | Reducer `appendAudit` (`src/engine/governance.ts`) on many `ProjectAction`s | Last **100** entries. No hash chain. `ADD_AUDIT` from the client is blocked. | SPA `/audit`, `/audit/:entryId`, Team Reports, monthly-close “Audit trail” signal, close-pack `audit_activity` CSV. `src/api/client.ts` has **no** `GET .../audit` call. |
| **Filesystem JSONL** | `auditHook` in `database.ts` after a successful reducer write | SHA-256 `prevHash` chain. No mutex. | `GET /api/projects/:id/audit` only. |

The Export Centre / cost-control copy that says “append-only on the server” is the JSONL store. The on-screen trail is the capped in-state array.

Audit files are `{dataRoot}/audit/{projectId}.jsonl` (override with `AUDIT_DIR`). The chain is SHA-256 over each record plus `prevHash` (see `SECURITY.md`). Appends use `appendFileSync` with **no mutex** — concurrent actions on the same project can interleave lines and break `integrity.ok`. Trailing corrupt lines are skipped so a bad append cannot 500 an already-committed write. Baselines are `{dataRoot}/baselines/{projectId}/`.

`dataRoot` is `../../data` from `import.meta.url` of the compiled module:

| How the API runs | `dataRoot` | SQL migrations directory |
|---|---|---|
| `tsx` (`npm run dev:server`) | `server/data` | `server/src/db/migrations` |
| Bundled `server/dist/index.js` | repo-root `data/` | `server/dist/migrations` |

The production `Dockerfile` copies `server/dist` JS and the client `dist/`, not the `.sql` files and not `server/data`. `index.ts` still runs JSON-store `runMigrations()` **before** `initDatabase()`, even when Postgres is configured — that mkdir/writes the bundled `data/` tree (audit/baselines live there too). Compose does not mount a volume on `/app/data`. See `DEPLOYMENT.md`.

## Platform

| Method | Path | Min role | Purpose |
|---|---|---|---|
| GET | `/api/platform/filters` | viewer | List the caller’s filters plus any `shared: true` row (optional `?scope=`). The SPA (`useSavedFilters`) falls back to `localStorage` on request failure — local and server copies can diverge. |
| POST | `/api/platform/filters` | viewer | Save `{ name, scope, payload, shared? }`. 201. |
| DELETE | `/api/platform/filters/:filterId` | viewer | Owner-only (`user_id` match). Non-owners get **404**. 204 on success. Shared rows stay listed for others until the owner deletes them. |
| GET | `/api/platform/workflows` | viewer | Workflow definitions from `src/data/workflowConfig.ts`. |
| GET | `/api/platform/workflows/delegations` | viewer | All stored delegations (Postgres `LIMIT 50`, or `{dataRoot}/workflow_delegations.json`). **Not** filtered by caller or project. |
| POST | `/api/platform/workflows/delegations` | admin | Persist `{ workflowId, projectId?, fromUserId, toUserId, until }`. **Storage only** — `workflowEngine.ts` never reads delegations. |
| GET | `/api/platform/portfolio/governance` | viewer | Default PMO policy + roll-up of the **active** project. |
| GET/POST | `/api/platform/projects/:projectId/roles` | admin | List / assign `{ userId, role }`. |
| GET/POST | `/api/platform/projects/:projectId/export-jobs` | viewer / cost_controller | Scheduled close-pack jobs. POST body is `{ scheduleCron? }` only (`exportJobSchema`) — **`packType` is not accepted**; the store always writes `close_pack`. |
| GET | `/api/platform/integrations/adapters` | viewer | Adapter registry (`?domain=`). Each row is a **static** object with `configured: false` — OAuth state in the DB/file is **not** merged into this list. |
| POST | `/api/platform/integrations/oauth/:connectorId` | admin | Store connector OAuth tokens (AES-256-GCM). `CREDENTIALS_KEY` or, if unset, `JWT_SECRET`. `decryptConnectorTokens` still accepts legacy **plaintext** JSON (payloads that do not start with `enc:v1:`). |
| POST | `/api/platform/integrations/sync` | admin | Simulated inbound sync. Connectors other than `sap-s4` no-op until OAuth-configured. **`sap-s4` always runs** `sapSync` against **hard-coded sample rows** (`A.01`, `A.01.01`, `UNKNOWN-WBS`) even when not configured. |
| POST | `/api/platform/webhooks/:connectorId` | HMAC | Inbound webhook. Header `x-webhook-signature: sha256=<hex>` (bare hex also accepted). `sap-s4` payloads with `rows` are validated against WBS **`A.01` and `A.02` only** (stricter than `sapSync`’s sample allowlist). |

### Webhook secrets

`WEBHOOK_SECRET_<CONNECTOR>` overrides `WEBHOOK_SECRET` (`connectorId` uppercased, non-alphanumerics → `_`). In production a missing secret is 401; in development unsigned requests are allowed so local demos work. When Postgres is on, deliveries are inserted into `webhook_deliveries` (this table **is** used).

Postgres tables vs live writers (schema in `002` / `003`):

| Table | Live writer? |
|---|---|
| `projects`, `project_state` | Yes — JSONB blob |
| `app_settings` | Yes — `active_project_id` |
| `users`, `user_project_roles`, `saved_filters`, `workflow_delegations`, `export_jobs`, `connector_credentials`, `webhook_deliveries` | Yes (see routes above) |
| `portfolios` | Seeded `'default'` row only — no portfolio CRUD |
| `audit_events`, `baseline_snapshots`, `integration_sync_jobs`, `workflow_definitions` | **Created, never written** |

### Export jobs — constraint

`scheduleCron` is stored but **not executed as cron** (the default string `'0 6 1 * *'` is documentation only). `nextMonthlyRun()` sets the clock to **the 1st of next month at 06:00 in the process local timezone**, then stores `toISOString()`. `runDueExportJobs` (`server/src/index.ts`) polls **hourly** and always calls `generateClosePackPdfAsync`. Custom cron expressions do not change when the job fires. `packType` cannot be set via POST (schema omits it) and the runner would ignore it anyway.

The scheduled PDF is built **in memory and discarded**. `index.ts` only `console.log`s the project id — there is no file write, mailbox, or attachment store. Interactive download still uses `GET .../exports/close-pack.pdf`.

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
| `baseline-sanction` | working → proposed → sanctioned → locked | cost_controller / approver / admin | Published on `/workflows`; **not** asserted in `workflowEngine.ts`. Create/lock use the baseline routes (approver create, admin lock) |

Only `assertForecastWorkflowTransition` and `assertChangeWorkflowTransition` run before the reducer. Delegations stored via `/workflows/delegations` do **not** grant extra permission to approve or submit.

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

The global rate limiter (`RATE_LIMIT_PER_MIN`, default 300 / 60s) applies to **every** route including `/api/health*`. Login and OIDC add a second limiter (10 / 15 min). `DISABLE_RATE_LIMIT` is rejected in production. Tests always skip the limiter (`rateLimitDisabled()` is true when `NODE_ENV=test`).

`express.json` stores `rawBody` on the request for webhook HMAC (`webhookAuth.ts`). Helmet is the library default (`app.use(helmet())`) — no custom CSP. `TRUST_PROXY=true` means **one** trusted hop (`trustProxySetting`); a positive integer is hop count; unset leaves Express default (do not enable blindly behind a proxy).

## Client persistence (SPA)

| Key | Writer | When it is used |
|---|---|---|
| `pc-token`, `pc-user`, `pc-role`, `pc-expires-at` | `src/api/client.ts` | Session. Expiry is client-side only (no refresh). |
| `project-controls-platform-v2` | `src/store/persistence.ts` (`schemaVersion: 2`) | Offline project blob. Saved only when the backend is **down**. Mismatched schema → discard and re-seed. |
| `project-controls-intelligence-state-v1` | `src/utils/workflow.ts` | Legacy extraction `{ reports, values, selectedValueId }`. Cleared on **offline** Reset demo (`clearStoredState`); ErrorBoundary “Reset local data” does **not** remove it or the auth keys. |

ErrorBoundary recovery (`src/components/ErrorBoundary.tsx`) removes only `project-controls-platform-v2`. Auth keys and the v1 extraction key survive that button.

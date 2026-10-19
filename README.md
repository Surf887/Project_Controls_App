# Project Controls Intelligence Platform

Project controls workspace aligned with EcoSys / Oracle Unifier / AACE workflows. Runs as a full client + API stack: a React/Vite SPA backed by an Express + TypeScript API with a JSON-file or PostgreSQL project store, JWT/OIDC auth with RBAC, and an audited action reducer. A browser-only `localStorage` fallback exists for offline demos.

## Quick start

### Full stack (recommended)

```bash
npm install
npm install --prefix server
npm run dev
```

- **Frontend:** http://localhost:5173/ (Vite proxies `/api` → backend)
- **API:** http://localhost:3001/api/health

The React app hydrates project state from the API and dispatches all mutations as `ProjectAction`s that the server reducer applies under optimistic concurrency control (`If-Match` version). If the API is unreachable the client falls back to `localStorage`.

### Frontend only (legacy local mode)

```bash
npm run dev:client
```

```bash
npm run build    # production client build + typecheck
npm run test     # Vitest engine + server suite
```

### API only

```bash
npm run dev:server
```

Default store is the JSON file at `server/data/projects.json` (auto-seeded on first run). Set `DATABASE_URL` to enable the PostgreSQL store (`server/src/db/postgresProjectStore.ts`) for enterprise persistence.

### Environment files

Copy `.env.example` to `.env` at the **repo root** for Vite (`VITE_*`). The API file loader (`server/src/config/loadEnv.ts`) does **not** override variables already in the process environment, and the file it reads depends on how the process is started:

| How you run the API | File loaded |
|---|---|
| `npm run dev:server` (`tsx` on `server/src/…`) | `server/.env` |
| Bundled `node server/dist/index.js` (Docker / `npm start --prefix server`) | repo-root `.env` |

If a parent process injects `PORT`, set `API_PORT=3001` so the API stays on its expected port. Vite (`vite.config.ts`) **also** reads `PORT` (default 5173) and binds `--host 127.0.0.1` only — `API_PORT` does not keep the client on 5173.

First login (non-demo): set `ADMIN_EMAIL` + `ADMIN_PASSWORD` so startup can bootstrap the first admin when the user store is empty. Demo sign-in is documented under [Authentication](#authentication).

## Architecture

| Layer | Stack | Role |
|-------|-------|------|
| **Client** | React 19 + Vite | SPA, optimistic UI, dispatches actions to API |
| **API** | Express + TypeScript | REST endpoints, authoritative state mutations |
| **Database** | JSON file store (`server/data/projects.json`) or PostgreSQL (`DATABASE_URL`) | Persists full `ProjectState` per project; Postgres keeps it as a versioned JSONB blob today |
| **Domain logic** | `src/engine/*`, `src/store/projectReducer.ts` | Shared between client fallback and server |

### Key API routes

Full tables, RBAC, webhook signing, monthly-close gates, and workflow transitions: **`API.md`**.

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/health` | Process + optional DB ping (`ok`, not a `ready` field) |
| GET | `/api/health/live` | Liveness (restart policy) |
| GET | `/api/health/ready` | Readiness (503 if DB down) |
| GET | `/api/platform/auth/config` | Which login options the server exposes |
| POST | `/api/platform/auth/login` | Password session |
| POST | `/api/projects/:id/actions` | Apply `ProjectAction` (`If-Match` version; 409 on conflict) |
| GET | `/api/projects/:id/compute/forecast` | Server-side forecast totals (`rows` = snapshot count) |
| GET | `/api/projects/:id/compute/evm` | Server-side EVM `{ summary, accounts }` (`accounts` = account count) |
| GET | `/api/projects/:id/exports/close-pack.pdf` | Monthly close PDF |


## Modules

Navigation is designed for **oil & gas capital project controls** (AACE TCM monthly close cycle), not a copy of EcoSys/Unifier menus. See `src/data/navigationModel.ts` for rationale per group.

| Group | Purpose | Modules |
|-------|---------|---------|
| **Programme overview** | Owner / PMO health | Command Center, Portfolio Compare |
| **Estimate & baseline** | MCE → CCE at sanction | BoE, WBS, Cost Structure (CBS · TECOP/NTR), ISO 19008 SCCS |
| **Monthly control cycle** | Period close sequence | Accruals, Cost Sheet, Contingency, Forecast Engine, Forecast Approval, What-if & Monte Carlo |
| **VOWD & performance** | Physical progress → EV | Rules of Credit, EVM, Predictive |
| **Commitments & delivery** | PO · LLI · FX together | Long-Lead, Procurement, FX & Hedging |
| **Change & risk board** | Linked governance | Change Register, Claims, Risks, Opportunities, Decisions |
| **EPC execution** | Discipline workspaces | Engineering, Construction, Commissioning |
| **Project logs** | Supporting registers | Issues, Actions, Lessons |
| **Reporting & traceability** | Stakeholder packs | Team Reports, Audit Trail |
| **Contractor submissions** | Early variation capture | Ingestion, Review, Validation, Lineage |
| **Platform admin** | Integrations & intel | Connectors, Governance, intel modules |

### Improvements over legacy PMIS (EcoSys / Unifier)

| Legacy flaw | Our approach |
|-------------|--------------|
| Budget change vs forecast variance conflated | **Change mechanism** types: budget / scope / forecast change / forecast variance |
| VOWD (RoC) separated from cost close | **VOWD & performance** group before month-end financial close |
| Commitments, LLI, FX in separate silos | **Commitments & delivery** single exposure view |
| Risk register disconnected from change board | **Change & risk board** combined |
| Contractor variations captured late | **Contractor submissions** positioned in control cycle |

## Forecast engine

Deterministic EAC per WBS row:

- **Best case** — approved changes only
- **Most likely** — pending changes × probability + risk exposure + optional FX stress
- **Worst case** — full pending changes + open-risk worst case + 2× FX stress

**Contingency engine** — CN.00 / MR.00 reserve WBS rows with auto-draw rules linked to approved changes in the Change Register.

**FX module** — multi-currency POs, treasury rate table, hedge % per commitment, unhedged exposure rolled into forecast when enabled.

**ISO 19008 SCCS** — PBS · SAB · COR facet tables and a composite code on each control account (`src/engine/sccs.ts`). Manual assignments win; otherwise WBS/CBS/phase mapping fills the code. Roll-up at `/cost-structure/sccs` sums **control accounts only** (same grain as financial totals).

**Accruals** — period-end unbilled cost from subcontracts (earned − invoiced), PO commitment gaps, pending invoices, and manual/timesheet adjustments. WBS rollup shows posted actuals + open accruals = economic actuals. `accruedCostForWbs` includes the queried WBS and its **descendants** only (`reviewed` / `posted`) — a parent-level entry is not attributed to every child. Generated PO accruals are booked to WBS `P.04` (`purchaseOrderAccrual`), not the PO line’s own code.

Cost sheet EAC and approved changes sync from registers. FTC period forecasts support **linear**, **front-end loaded**, and **back-end loaded** curves.

Monte Carlo (N=2000) in **Cost & forecast → What-if** reports P10/P50/P90, histogram, tornado, and CDF.

## Progress & cost structure

**Rules of credit** — configurable step templates (engineering drawings, piping install, equipment setting, rotating procurement). Assignments on deliverables, work fronts, and WBS rows drive earned % in phase workspaces and EVM earned value.

**Long-lead items** — dedicated register with lead time, criticality, required vs forecast on-site dates, PO linkage, and expediting milestone context.

**Cost structure** — CBS hierarchy with direct/indirect nature, TECOP/NTR categories, burden rules, and loaded-budget view tied to cost sheet control accounts.

## Governance & reporting

**Portfolio compare** — side-by-side BAC, EAC, CPI/SPI, open changes/risks, and forecast approval status across seeded portfolio projects (active project syncs from live state).

**Monthly close** — guided hub at `/close` (`src/engine/monthlyCloseProgress.ts`): baseline → WBS → accruals → VOWD → changes → forecast → approval → reports. Each step is derived from live data (not a stored workflow status); later steps stay blocked until the prior step completes. Gate table: `API.md`. Command palette: Ctrl/Cmd+K.

**Forecast approval** — draft monthly package from forecast engine → submit → approve/reject with workflow trail; approved packages lock reporting context. Server rejects illegal status transitions (`server/src/services/workflowEngine.ts`).

**Change register workflow** — raise change requests in-app, submit for approval, approve/reject with step-by-step approval history per CO.

**Team reports** — CSV packs by audience (cost summary, change register, forecast status, EVM snapshot, audit activity, ISO 19008 SCCS roll-up) for team consumption. Close-pack `audit_activity` is the in-state log (see below).

**Audit trail** — two stores. The SPA `/audit` page, `/audit/:entryId` drill-down, Team Reports, and monthly-close “Audit trail” signal read **in-state** `state.auditLog` (last 100, reducer). `GET /api/projects/:id/audit` is a separate append-only SHA-256 JSONL file the SPA never fetches. Details: `API.md`.

## WBS CSV format

```csv
wbs,parentWbs,description,costType,phase,discipline,originalBudget,currency
A.01,,Process Area A,CAPEX,Engineering,Mechanical,84000000,USD
```

## Scope limits (v1)

- Active project is single-project at a time; portfolio compare shows seeded benchmark projects alongside the live one
- Persistence is either JSON file or PostgreSQL (set `DATABASE_URL`); project state is stored as a versioned JSONB blob in Postgres today — splitting cost sheet / registers into relational tables is the next enterprise step
- Baseline snapshots and audit log are filesystem JSONL/JSON. Under `tsx` they live in `server/data/{baselines,audit}`; the production bundle writes repo-root `data/` (`../../data` from `server/dist`). Migrating both into Postgres tables is still a follow-up.
- Auth is password login at `/api/platform/auth/login`, optional OIDC **token exchange** at `/api/platform/auth/oidc` (`OIDC_ISSUER`, `OIDC_CLIENT_ID`), and per-project RBAC (`server/src/auth`). Demo role switching (`x-pc-role` / `POST /api/platform/auth/token`) is never available in production. In development, server demo auth defaults **on** if `DEMO_AUTH` is unset; the client switcher still needs `VITE_DEMO_AUTH=true`. See [Authentication](#authentication) and `API.md`.
- Integrations use simulated handshake/sync (configure endpoints, no live OAuth)
- No P6/SAP/EcoSys live API feeds
- Monte Carlo is AACE-aligned but not a substitute for specialist risk consultancy tools

## Authentication

| Path | When to use |
|---|---|
| Password (`ADMIN_EMAIL` / `ADMIN_PASSWORD` on first boot) | Local or production accounts |
| OIDC exchange + optional `VITE_OIDC_LOGIN_URL` (`#id_token=` fragment) | Corporate SSO. JWKS verify (`OIDC_ISSUER` + `OIDC_CLIENT_ID`); `OIDC_CLIENT_SECRET` is unused. Not Authorization-Code + PKCE yet. |
| Demo `POST /api/platform/auth/token` / `x-pc-role` | Local demos and Playwright only |

The UI hydrates from the API:

- **Demo auth on, no token** — the SPA auto-mints `POST /api/platform/auth/token` (`projectStore`) and skips login.
- **API reachable, demo auth off, no credentials** — login screen (not offline mode).
- **API unreachable** — `localStorage` fallback (no login).

Vite **dev** shows the demo login chrome even when `VITE_DEMO_AUTH=false` (`import.meta.env.DEV` in `App.tsx`). The client sends `x-pc-role` **only** when `VITE_DEMO_AUTH === 'true'` (no Bearer). Server demo auth is the flag that actually mints tokens; the role switcher remints `POST /token`. With demo auth on, a request that has **no Bearer token** is still the **cost_controller** demo user.

For persisted accounts, the live user store is the source of truth: JWT `role` is ignored, and a disabled user is unauthenticated on the next request.

## Reset demo data

Use **Reset demo** in the top bar to restore seeded state and clear saved local data (admin-only against the API).

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| Login screen with no users that work | User store is empty and `ADMIN_EMAIL`/`ADMIN_PASSWORD` were not set before first boot. |
| Empty `GET /api/projects` after password login | `ENFORCE_PROJECT_MEMBERSHIP` is on (production default). Non-admins need a row in `user_project_roles`. The bootstrap admin sees every project. |
| Disabled user can still call the API | They cannot, once the store flag is set: Bearer → unauthenticated (401). Password login is generic 401; OIDC is 403. There is no HTTP disable-user route — edit the store. |
| Demo chrome in Vite but `/auth/token` is 404 | Client chrome is on whenever `import.meta.env.DEV` is true. `x-pc-role` is sent only if `VITE_DEMO_AUTH=true`. Server demo auth is a separate flag (`DEMO_AUTH` / `NODE_ENV`). Set `DEMO_AUTH=true` or use password login. Production always rejects demo auth. |
| Silent login as Cost Controller in `npm run dev` | Demo auth defaults **on** in development. Missing `Authorization` ⇒ `x-pc-role` empty ⇒ **cost_controller**. Set `DEMO_AUTH=false` in `server/.env` for real login locally. |
| Server ignored repo-root `.env` in `npm run dev` | `tsx` loads `server/.env`, not the monorepo root. Copy or symlink, or export the vars. The production bundle reads the repo-root file. |
| `JWT_ISSUER` / `SESSION_TTL_SEC` / `DATABASE_PATH` / `USERS_PATH` / `BCRYPT_ROUNDS` in `.env` had no effect | Captured when their modules load, **before** `loadRootEnvFile()`. Export them in the shell or inject them (Compose already injects `JWT_ISSUER`). |
| `Requires … role` / `You do not have access` | Production defaults `ENFORCE_PROJECT_MEMBERSHIP=true`. Assign the user with `POST /api/platform/projects/:id/roles`, or sign in as the bootstrap admin. |
| Global approver suddenly a viewer on one project | A project role **replaces** the global role (`effectiveRole`). There is no HTTP disable-user / global-role-change API — only register + project-role assign. |
| Saved a workflow delegation but still cannot approve | Delegations are stored and listed; `workflowEngine.ts` never consults them. |
| `GET .../compute/evm` has no account rows | `accounts` is a **count**, same pattern as forecast `rows`. |
| Edit discarded after save | `409` version conflict — another writer won. The UI reloads server state; re-apply the edit. Scripts that omit `If-Match` skip the **version** check. On the JSON store that can lose a concurrent write (no mutex); Postgres still serializes with `FOR UPDATE`. |
| Hand-edited `projects.json` had no effect | `JsonProjectStore` keeps an **in-memory cache**. Restart the API after disk edits. Postgres reads the DB each request. |
| API listens on the wrong port **or** Vite is not on 5173 | Both read `PORT`. Vite uses `PORT` or 5173 (`--host 127.0.0.1`). API uses `API_PORT`, then `PORT`, then 3001. If a harness sets `PORT`, set `API_PORT=3001` for the API; the client will still follow `PORT`. Playwright expects `127.0.0.1:5173` + `:3001`. |
| Cannot open the Vite app from another machine | `dev:client` binds `127.0.0.1` only (`package.json`). |
| Server refuses to start in production | Missing `DATABASE_URL` or `JWT_SECRET` (<16 chars also fails). `DEMO_AUTH=true`, `DISABLE_RATE_LIMIT=true`, and `USERS_PATH` are rejected in production. |
| Compose/image exits while applying SQL migrations | Bundled `runSqlMigrations()` reads `server/dist/migrations`. The current `Dockerfile` does not COPY the `.sql` files there. `tsx` uses `server/src/db/migrations` (works locally). |
| Compose/image fails at JSON `runMigrations()` or loses audit after recreate | `runMigrations()` (filesystem JSON bootstrap) **always** runs, including when `DATABASE_URL` is set. The bundle writes `/app/data` as `USER node`. Compose defines **no volume** for that path — mkdir can `EACCES`, and even a successful write is ephemeral. Mount `/app/data` (or set `AUDIT_DIR`) and chown it for `node`. |
| Audit / baseline files not under `server/data` in Docker | The bundle resolves `../../data` from `server/dist` → repo-root `data/` (`/app/data`). Point `DATA_DIR` / `AUDIT_DIR` at that location. |
| Adapter list always `configured: false` / SAP sync looks “live” | `GET .../integrations/adapters` does not load OAuth state. `sap-s4` sync uses hard-coded sample rows even when unconfigured. |
| Scheduled export ignored `scheduleCron` / `packType` | Hourly poll; next run is 1st of next month **06:00 local**, then ISO. Runner builds a close-pack PDF **in memory and discards it** (`console.log` only). Use `GET .../exports/close-pack.pdf` for a real download. |
| SPA Audit trail empty / missing JSONL events | `/audit` reads `state.auditLog` (cap 100). Server JSONL is `GET /api/projects/:id/audit` only — the client never calls it. |
| Viewer click on an extracted value moved everyone else’s selection | `SET_SELECTED_VALUE` is viewer-allowed and writes shared `selectedValueId` on the project. |
| Server PDF download failed but you stayed logged in | `downloadClosePackPdf` throws a generic `Error`, not `ApiError` — 401 does not expire the session. |
| `audit_events` / `baseline_snapshots` empty in Postgres | Those tables (plus `integration_sync_jobs`, `workflow_definitions`) are schema-only. Live writers are filesystem JSONL/JSON. Active project id lives in `app_settings`. |
| E2E / some server tests fail locally | Run with `DEMO_AUTH=true` (CI already does). |
| Accrual total on a child WBS looks “too small” | Parent-level accruals no longer roll down onto children (see Forecast engine → Accruals). |
| Monthly close step stuck on “blocked” | Prior step is incomplete. Gates are sequential — see `API.md` Monthly close gates. |

Operational runbook: `DEPLOYMENT.md`. Contributing checks: `CONTRIBUTING.md`.

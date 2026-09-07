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

Copy `.env.example` to `.env` at the **repo root**. The API loads that file at boot (`server/src/config/loadEnv.ts`) and does **not** override variables already in the process environment. If a parent process injects `PORT`, set `API_PORT=3001` so the API stays on its expected port.

First login (non-demo): set `ADMIN_EMAIL` + `ADMIN_PASSWORD` so startup can bootstrap the first admin when the user store is empty. Demo sign-in is documented under [Authentication](#authentication).

## Architecture

| Layer | Stack | Role |
|-------|-------|------|
| **Client** | React 19 + Vite | SPA, optimistic UI, dispatches actions to API |
| **API** | Express + TypeScript | REST endpoints, authoritative state mutations |
| **Database** | JSON file store (`server/data/projects.json`) or PostgreSQL (`DATABASE_URL`) | Persists full `ProjectState` per project; Postgres keeps it as a versioned JSONB blob today |
| **Domain logic** | `src/engine/*`, `src/store/projectReducer.ts` | Shared between client fallback and server |

### Key API routes

Full tables, RBAC, webhook signing, and workflow gates: **`API.md`**.

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/health` | Process + optional DB ping (`ok`, not a `ready` field) |
| GET | `/api/health/live` | Liveness (restart policy) |
| GET | `/api/health/ready` | Readiness (503 if DB down) |
| GET | `/api/platform/auth/config` | Which login options the server exposes |
| POST | `/api/platform/auth/login` | Password session |
| POST | `/api/projects/:id/actions` | Apply `ProjectAction` (`If-Match` version; 409 on conflict) |
| GET | `/api/projects/:id/compute/forecast` | Server-side forecast totals |
| GET | `/api/projects/:id/compute/evm` | Server-side EVM summary |
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

**Accruals** — period-end unbilled cost from subcontracts (earned − invoiced), PO commitment gaps, pending invoices, and manual/timesheet adjustments. WBS rollup shows posted actuals + open accruals = economic actuals. `accruedCostForWbs` includes the queried WBS and its **descendants** only — a parent-level entry (for example PO accruals on `P.04`) is not attributed to every child.

Cost sheet EAC and approved changes sync from registers. FTC period forecasts support **linear**, **front-end loaded**, and **back-end loaded** curves.

Monte Carlo (N=2000) in **Cost & forecast → What-if** reports P10/P50/P90, histogram, tornado, and CDF.

## Progress & cost structure

**Rules of credit** — configurable step templates (engineering drawings, piping install, equipment setting, rotating procurement). Assignments on deliverables, work fronts, and WBS rows drive earned % in phase workspaces and EVM earned value.

**Long-lead items** — dedicated register with lead time, criticality, required vs forecast on-site dates, PO linkage, and expediting milestone context.

**Cost structure** — CBS hierarchy with direct/indirect nature, TECOP/NTR categories, burden rules, and loaded-budget view tied to cost sheet control accounts.

## Governance & reporting

**Portfolio compare** — side-by-side BAC, EAC, CPI/SPI, open changes/risks, and forecast approval status across seeded portfolio projects (active project syncs from live state).

**Monthly close** — guided hub at `/close` (`src/engine/monthlyCloseProgress.ts`): baseline → WBS → accruals → VOWD → changes → forecast → approval → reports. Command palette: Ctrl/Cmd+K.

**Forecast approval** — draft monthly package from forecast engine → submit → approve/reject with workflow trail; approved packages lock reporting context. Server rejects illegal status transitions (`server/src/services/workflowEngine.ts`).

**Change register workflow** — raise change requests in-app, submit for approval, approve/reject with step-by-step approval history per CO.

**Team reports** — CSV packs by audience (cost summary, change register, forecast status, EVM snapshot, audit activity) for team consumption.

**Audit trail** — who changed forecast/cost sheet, settings, change decisions, and forecast approvals (last 100 entries, persisted).

## WBS CSV format

```csv
wbs,parentWbs,description,costType,phase,discipline,originalBudget,currency
A.01,,Process Area A,CAPEX,Engineering,Mechanical,84000000,USD
```

## Scope limits (v1)

- Active project is single-project at a time; portfolio compare shows seeded benchmark projects alongside the live one
- Persistence is either JSON file or PostgreSQL (set `DATABASE_URL`); project state is stored as a versioned JSONB blob in Postgres today — splitting cost sheet / registers into relational tables is the next enterprise step
- Baseline snapshots and audit log are written to the filesystem under `server/data/baselines` and `server/data/audit`; migrating both into Postgres tables is tracked as a follow-up for enterprise-grade versioning
- Auth is password login at `/api/platform/auth/login`, optional OIDC **token exchange** at `/api/platform/auth/oidc` (`OIDC_ISSUER`, `OIDC_CLIENT_ID`), and per-project RBAC (`server/src/auth`). Demo role switching (`x-pc-role` / `POST /api/platform/auth/token`) is never available in production. In development, server demo auth defaults **on** if `DEMO_AUTH` is unset; the client switcher still needs `VITE_DEMO_AUTH=true`. See [Authentication](#authentication) and `API.md`.
- Integrations use simulated handshake/sync (configure endpoints, no live OAuth)
- No P6/SAP/EcoSys live API feeds
- Monte Carlo is AACE-aligned but not a substitute for specialist risk consultancy tools

## Authentication

| Path | When to use |
|---|---|
| Password (`ADMIN_EMAIL` / `ADMIN_PASSWORD` on first boot) | Local or production accounts |
| OIDC exchange + optional `VITE_OIDC_LOGIN_URL` (`#id_token=` fragment) | Corporate SSO (not Authorization-Code + PKCE yet) |
| Demo `POST /api/platform/auth/token` / `x-pc-role` | Local demos and Playwright only |

The UI hydrates from the API. If the API returns 401, the login screen is shown. If the API is **unreachable**, the client falls back to `localStorage` (no login).

## Reset demo data

Use **Reset demo** in the top bar to restore seeded state and clear saved local data (admin-only against the API).

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| Login screen with no users that work | User store is empty and `ADMIN_EMAIL`/`ADMIN_PASSWORD` were not set before first boot. |
| Demo role switcher missing / `/auth/token` is 404 | Client needs `VITE_DEMO_AUTH=true` **and** the server must have demo auth on. Production always rejects demo auth. |
| `Requires … role` / `You do not have access` | Production defaults `ENFORCE_PROJECT_MEMBERSHIP=true`. Assign the user with `POST /api/platform/projects/:id/roles`, or sign in as the bootstrap admin. |
| Edit discarded after save | `409` version conflict — another writer won. The UI reloads server state; re-apply the edit. |
| API listens on the wrong port | A parent process set `PORT`. Set `API_PORT=3001`. Root `.env` does not override existing env vars. |
| Server refuses to start in production | Missing `DATABASE_URL` or `JWT_SECRET` (<16 chars also fails). `DEMO_AUTH=true` and `DISABLE_RATE_LIMIT=true` are rejected in production. |
| E2E / some server tests fail locally | Run with `DEMO_AUTH=true` (CI already does). |
| Accrual total on a child WBS looks “too small” | Parent-level accruals no longer roll down onto children (see Forecast engine → Accruals). |

Operational runbook: `DEPLOYMENT.md`. Contributing checks: `CONTRIBUTING.md`.

# Project Controls Intelligence Platform

Project controls workspace aligned with EcoSys / Oracle Unifier / AACE workflows. Runs as a full client + API stack: a React/Vite SPA backed by an Express + TypeScript API with a JSON-file or PostgreSQL project store, JWT/OIDC auth with RBAC, and an audited action reducer. A browser-only `localStorage` fallback exists for local or explicitly enabled offline demos; production builds fail closed when the API is unavailable.

## Quick start

### Full stack (recommended)

```bash
npm install
npm install --prefix server
npm run dev
```

- **Frontend:** http://localhost:5173/ (Vite proxies `/api` → backend)
- **API:** http://localhost:3001/api/health

The React app hydrates project state from the API and dispatches all mutations as `ProjectAction`s that the server reducer applies under optimistic concurrency control (`If-Match` version). If the API is unreachable, local development can fall back to `localStorage`; a production build requires `VITE_ALLOW_OFFLINE=true` to opt into that demo behavior.

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

## Architecture

| Layer | Stack | Role |
|-------|-------|------|
| **Client** | React 19 + Vite | SPA, optimistic UI, dispatches actions to API |
| **API** | Express + TypeScript | REST endpoints, authoritative state mutations |
| **Database** | JSON file store (`server/data/projects.json`) or PostgreSQL (`DATABASE_URL`) | Persists full `ProjectState` per project; Postgres keeps it as a versioned JSONB blob today |
| **Domain logic** | `src/engine/*`, `src/store/projectReducer.ts` | Shared between client fallback and server |

### Key API routes

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/health` | Liveness check |
| GET | `/api/projects` | List projects |
| GET | `/api/projects/active` | Active project state |
| GET | `/api/projects/:id` | Project state by id |
| POST | `/api/projects/:id/activate` | Switch active project |
| POST | `/api/projects/:id/actions` | Apply `ProjectAction` (server runs reducer) |
| POST | `/api/projects/:id/reset` | Reset project to seed data |
| GET | `/api/projects/:id/compute/forecast` | Server-side forecast totals |
| GET | `/api/projects/:id/compute/evm` | Server-side EVM summary |


## Modules

Navigation is designed for **oil & gas capital project controls** (AACE TCM monthly close cycle), not a copy of EcoSys/Unifier menus. See `src/data/navigationModel.ts` for rationale per group.

| Group | Purpose | Modules |
|-------|---------|---------|
| **Programme overview** | Owner / PMO health | Command Center, Portfolio Compare |
| **Estimate & baseline** | MCE → CCE at sanction | BoE, WBS, Cost Structure (CBS · TECOP/NTR) |
| **Schedule control** | Baseline/current programme → cost accounts | P6 CSV import, relationship validation, critical/late activities, schedule-cost performance |
| **Monthly control cycle** | Period close sequence | Accruals, Cost Sheet, Contingency, Forecast Engine, Forecast Approval |
| **VOWD & performance** | Physical progress → EV | Rules of Credit, EVM, Predictive |
| **Commitments & delivery** | PO · LLI · FX together | Long-Lead, Procurement, FX & Hedging |
| **Change & risk board** | Linked governance | Change Register, Risks, Opportunities, Decisions |
| **Forecast analytics** | Scenario / Monte Carlo | What-if |
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

**Accruals** — period-end unbilled cost from subcontracts (earned − invoiced), PO commitment gaps, pending invoices, and manual/timesheet adjustments. WBS rollup shows posted actuals + open accruals = economic actuals.

Cost sheet EAC and approved changes sync from registers. FTC period forecasts support **linear**, **front-end loaded**, and **back-end loaded** curves.

Monte Carlo (N=2000) in **Cost & forecast → What-if** reports P10/P50/P90, histogram, tornado, and CDF.

## Progress & cost structure

**Rules of credit** — configurable step templates (engineering drawings, piping install, equipment setting, rotating procurement). Assignments on deliverables, work fronts, and WBS rows drive earned % in phase workspaces and EVM earned value.

**Long-lead items** — dedicated register with lead time, criticality, required vs forecast on-site dates, PO linkage, and expediting milestone context.

**Cost structure** — CBS hierarchy with direct/indirect nature, TECOP/NTR categories, burden rules, and loaded-budget view tied to cost sheet control accounts.

## Integrated schedule control

The Schedule Control workspace imports a statused Primavera P6 CSV through a reviewed column-mapping stage. Activities and relationships are validated as one batch, source WBS codes are mapped to project control accounts, and every refresh retains import lineage and data-quality issues.

Mapped schedule progress drives control-account planned value, earned value, SPI, CPI, forecast finish, the schedule completion S-curve, EVM reports, and the monthly close workspace. Invalid batches are rejected atomically; unmatched WBS activities remain staged for manual mapping rather than silently posting.

Use **Download P6 sample** in Schedule Control for the supported columns. The reviewed browser path is limited to 1,000 activities / 250 KB; larger programmes require the planned streaming adapter. Live P6 API and XER ingestion remain follow-up adapters on the same canonical schedule model.

## Governance & reporting

**Portfolio compare** — side-by-side BAC, EAC, CPI/SPI, open changes/risks, and forecast approval status across seeded portfolio projects (active project syncs from live state).

**Forecast approval** — draft monthly package from forecast engine → submit → approve/reject with workflow trail; approved packages lock reporting context.

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
- Auth ships with JWT issuance at `/platform/auth/token` plus per-project RBAC (`server/src/auth`). Demo role switching via `x-pc-role` / topbar selector is gated behind `VITE_DEMO_AUTH=true` and `DEMO_AUTH=true` (both default **false**) — production deployments should configure OIDC (`OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`)
- Integrations use simulated handshake/sync (configure endpoints, no live OAuth)
- P6 CSV status imports are supported; P6 XER/live API and SAP/EcoSys live feeds are not yet implemented
- Monte Carlo is AACE-aligned but not a substitute for specialist risk consultancy tools

## Reset demo data

Use **Reset demo** in the top bar to restore seeded state and clear saved local data.
